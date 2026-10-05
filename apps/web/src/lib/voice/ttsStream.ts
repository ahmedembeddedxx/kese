// Browser client for the ElevenLabs text-to-dialogue WebSocket, the only
// stream that serves the Urdu-capable eleven_v4_turbo model. The agent's
// reply arrives sentence by sentence; we forward it and hand back PCM16
// audio as it is produced.
//
// Barge-in has no cancel message, so stop() simply closes the socket and
// the next speak() opens a new one with a fresh single-use token.

import { base64ToArrayBuffer } from "../base64";
import type { WebSocketFactory, WebSocketLike } from "./types";
import { WS_OPEN, defaultWebSocketFactory } from "./types";

export interface TtsConfig {
  url: string;
  modelId: string;
  voiceId: string;
  outputFormat: "pcm_24000";
  languageCode?: string | null;
  getToken: () => Promise<string>;
  webSocketFactory?: WebSocketFactory;
  keepAliveMs?: number;
}

export interface TtsCallbacks {
  onAudio: (pcm16: ArrayBuffer) => void;
  onTurnEnd: () => void;
  onError: (err: Error) => void;
}

interface TtsMessage {
  audio?: unknown;
  is_final_audio_for_turn?: unknown;
  is_final?: unknown;
  error?: unknown;
  message?: unknown;
  code?: unknown;
}

export class TtsStream {
  private readonly config: TtsConfig;
  private readonly callbacks: TtsCallbacks;
  private readonly keepAliveMs: number;

  private socket: WebSocketLike | null = null;
  private socketOpen = false;
  private connecting = false;
  private permanentlyClosed = false;
  /** Bumped by stop()/close()/failures so stale async work can detect it. */
  private generation = 0;
  /** Serialised messages waiting for the socket to open, in order. */
  private pending: string[] = [];
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private malformedReported = false;

  /** A turn is open between its first speak() and its endTurn(). */
  private turnOpen = false;
  /** endTurn() calls still waiting for the server's final-audio marker. */
  private inFlight = 0;
  private nextIsNewTurn = true;

  constructor(config: TtsConfig, callbacks: TtsCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.keepAliveMs = config.keepAliveMs ?? 12_000;
  }

  get speaking(): boolean {
    return this.turnOpen || this.inFlight > 0;
  }

  speak(text: string): void {
    if (this.permanentlyClosed || text.trim().length === 0) return;
    const input = {
      text,
      voice_id: this.config.voiceId,
      new_turn: this.nextIsNewTurn,
    };
    this.nextIsNewTurn = false;
    this.turnOpen = true;
    this.dispatch({ inputs: [input] });
  }

  endTurn(): void {
    if (this.permanentlyClosed || !this.turnOpen) return;
    this.turnOpen = false;
    this.nextIsNewTurn = true;
    this.inFlight++;
    this.dispatch({ flush: true });
  }

  stop(): void {
    this.generation++;
    this.pending = [];
    this.connecting = false;
    this.turnOpen = false;
    this.inFlight = 0;
    this.nextIsNewTurn = true;
    this.clearKeepAlive();
    this.detachSocket(true);
  }

  close(): void {
    this.permanentlyClosed = true;
    this.stop();
  }

  private dispatch(payload: unknown): void {
    const data = JSON.stringify(payload);
    if (this.socket && this.socketOpen) {
      this.sendRaw(data);
      return;
    }
    this.pending.push(data);
    if (!this.connecting && !this.socket) this.startConnect();
  }

  private startConnect(): void {
    const generation = this.generation;
    this.connecting = true;
    this.malformedReported = false;

    this.config.getToken().then(
      (token) => {
        if (generation !== this.generation || this.permanentlyClosed) return;
        this.openSocket(token, generation);
      },
      (err: unknown) => {
        if (generation !== this.generation) return;
        this.failConnection(err instanceof Error ? err : new Error(String(err)));
      },
    );
  }

  private openSocket(token: string, generation: number): void {
    let socket: WebSocketLike;
    try {
      const factory = this.config.webSocketFactory ?? defaultWebSocketFactory;
      socket = factory(this.buildUrl(token));
    } catch (err) {
      this.failConnection(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (generation !== this.generation) return;
      this.socketOpen = true;
      this.connecting = false;
      this.sendRaw(JSON.stringify({ voices: [this.config.voiceId] }));
      const queued = this.pending;
      this.pending = [];
      for (const data of queued) this.sendRaw(data);
      this.startKeepAlive();
    };
    socket.onmessage = (ev) => {
      if (generation === this.generation) this.handleMessage(ev.data);
    };
    socket.onerror = () => {
      // A close event always follows; report there to avoid double errors.
    };
    socket.onclose = (ev) => {
      if (generation !== this.generation) return;
      const wasSpeaking = this.speaking;
      this.resetAfterDrop();
      if (wasSpeaking) {
        this.callbacks.onError(new Error(`TTS socket closed unexpectedly (${ev.code})`));
      }
    };
  }

  private buildUrl(token: string): string {
    const params = new URLSearchParams();
    params.set("model_id", this.config.modelId);
    params.set("output_format", this.config.outputFormat);
    params.set("single_use_token", token);
    if (this.config.languageCode) params.set("language_code", this.config.languageCode);
    const sep = this.config.url.includes("?") ? "&" : "?";
    return `${this.config.url}${sep}${params.toString()}`;
  }

  private sendRaw(data: string): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WS_OPEN) return;
    try {
      socket.send(data);
    } catch {
      // Socket went away; onclose handles recovery.
    }
  }

  private startKeepAlive(): void {
    this.clearKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      this.sendRaw(JSON.stringify({ keep_alive: true }));
    }, this.keepAliveMs);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private detachSocket(closeIt: boolean): void {
    const socket = this.socket;
    this.socket = null;
    this.socketOpen = false;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (closeIt) {
      try {
        socket.close(1000, "client stop");
      } catch {
        // already closing
      }
    }
  }

  /** Server or network dropped the socket: forget it so speak() reconnects. */
  private resetAfterDrop(): void {
    this.generation++;
    this.pending = [];
    this.connecting = false;
    this.turnOpen = false;
    this.inFlight = 0;
    this.nextIsNewTurn = true;
    this.clearKeepAlive();
    this.detachSocket(false);
  }

  private failConnection(err: Error): void {
    this.detachSocket(true);
    this.resetAfterDrop();
    this.callbacks.onError(err);
  }

  private handleMessage(data: unknown): void {
    let msg: TtsMessage;
    try {
      if (typeof data !== "string") throw new Error("non-text frame");
      const parsed: unknown = JSON.parse(data);
      if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
      msg = parsed as TtsMessage;
    } catch {
      if (!this.malformedReported) {
        this.malformedReported = true;
        this.callbacks.onError(new Error("TTS sent a malformed message"));
      }
      return;
    }

    if (msg.error !== undefined && msg.error !== null) {
      const detail = typeof msg.message === "string" && msg.message ? msg.message : "";
      const head = typeof msg.error === "string" ? msg.error : "TTS error";
      this.callbacks.onError(new Error(detail && detail !== head ? `${head}: ${detail}` : head));
      return;
    }

    if (typeof msg.audio === "string" && msg.audio.length > 0) {
      let buffer: ArrayBuffer;
      try {
        buffer = base64ToArrayBuffer(msg.audio);
      } catch {
        this.callbacks.onError(new Error("TTS sent undecodable audio"));
        return;
      }
      if (buffer.byteLength > 0) this.callbacks.onAudio(buffer);
    }

    if (msg.is_final_audio_for_turn === true) {
      this.finishTurn(false);
    } else if (msg.is_final === true) {
      this.finishTurn(true);
    }
  }

  /**
   * `streamEnded` is the stream-level is_final marker. It only counts when
   * a flushed turn is still waiting, so a late duplicate cannot end a turn
   * that has since started.
   */
  private finishTurn(streamEnded: boolean): void {
    if (this.inFlight > 0) {
      this.inFlight = streamEnded ? 0 : this.inFlight - 1;
    } else if (!streamEnded && this.turnOpen) {
      // Server closed the turn on its own before endTurn() was called.
      this.turnOpen = false;
      this.nextIsNewTurn = true;
    } else {
      return;
    }
    this.callbacks.onTurnEnd();
  }
}
