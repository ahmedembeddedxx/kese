// Browser client for ElevenLabs Scribe v2 Realtime (speech to text).
// Tokens are single use, so every connect() fetches a fresh one through
// the injected getToken callback. No API key ever lives here, and audio
// is only ever sent, never logged.

import { arrayBufferToBase64 } from "../base64";
import type { CloseInfo, WebSocketFactory, WebSocketLike } from "./types";
import { WS_OPEN, defaultWebSocketFactory } from "./types";

export interface ScribeConfig {
  url: string;
  modelId: string;
  /** Omit for automatic language detection (English + Urdu). */
  languageCode?: string | null;
  audioFormat: "pcm_16000";
  commitStrategy: "vad" | "manual";
  vadSilenceThresholdSecs?: number;
  sampleRate?: number;
  getToken: () => Promise<string>;
  webSocketFactory?: WebSocketFactory;
}

export interface ScribeCallbacks {
  onSessionStarted?: () => void;
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
  onError: (err: Error) => void;
  onClose: (info: CloseInfo) => void;
}

export type ScribeState = "idle" | "connecting" | "open" | "closed";

interface ScribeMessage {
  message_type?: unknown;
  text?: unknown;
  error?: unknown;
  message?: unknown;
}

function bytesToBase64(view: Int16Array): string {
  // Copy the exact bytes of the view (it may be a window onto a larger buffer).
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return arrayBufferToBase64(copy.buffer);
}

export class ScribeClient {
  private readonly config: ScribeConfig;
  private readonly callbacks: ScribeCallbacks;
  private readonly sampleRate: number;
  private socket: WebSocketLike | null = null;
  private currentState: ScribeState = "idle";
  private connectPromise: Promise<void> | null = null;
  private abortConnect: ((err: Error) => void) | null = null;
  private generation = 0;
  private malformedReported = false;

  constructor(config: ScribeConfig, callbacks: ScribeCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.sampleRate = config.sampleRate ?? 16_000;
  }

  get state(): ScribeState {
    return this.currentState;
  }

  connect(): Promise<void> {
    if (this.currentState === "open") return Promise.resolve();
    if (this.currentState === "connecting" && this.connectPromise) return this.connectPromise;

    const generation = ++this.generation;
    this.currentState = "connecting";
    this.malformedReported = false;

    const promise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: Error): void => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      this.abortConnect = fail;

      const run = async (): Promise<void> => {
        const token = await this.config.getToken();
        if (generation !== this.generation) throw new Error("Scribe connect cancelled");

        const factory = this.config.webSocketFactory ?? defaultWebSocketFactory;
        const socket = factory(this.buildUrl(token));
        this.socket = socket;

        socket.onopen = () => {
          if (generation !== this.generation) return;
          this.currentState = "open";
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        socket.onmessage = (ev) => {
          if (generation === this.generation) this.handleMessage(ev.data);
        };
        socket.onerror = () => {
          if (generation !== this.generation) return;
          if (this.currentState === "open") {
            this.callbacks.onError(new Error("Scribe socket error"));
          } else {
            this.teardown();
            try {
              socket.close();
            } catch {
              // already closing
            }
            fail(new Error("Scribe socket error"));
          }
        };
        socket.onclose = (ev) => {
          if (generation !== this.generation) return;
          const wasOpen = this.currentState === "open";
          this.teardown();
          if (!wasOpen) fail(new Error(`Scribe socket closed before open (${ev.code})`));
          this.callbacks.onClose({ code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
        };
      };

      run().catch((err: unknown) => {
        if (generation === this.generation) this.teardown();
        fail(err instanceof Error ? err : new Error(String(err)));
      });
    });

    this.connectPromise = promise;
    // The caller owns rejection handling; avoid an unhandled-rejection
    // warning for the stored copy when close() aborts a pending connect.
    promise.catch(() => undefined);
    return promise;
  }

  /** Stream one block of 16 kHz mono int16 PCM. Never throws. */
  sendAudio(pcm16: Int16Array): void {
    if (this.currentState !== "open" || pcm16.length === 0) return;
    this.sendJson({
      message_type: "input_audio_chunk",
      audio_base_64: bytesToBase64(pcm16),
      commit: false,
      sample_rate: this.sampleRate,
    });
  }

  /** Force a commit (manual commit strategy). */
  commit(): void {
    if (this.currentState !== "open") return;
    this.sendJson({
      message_type: "input_audio_chunk",
      audio_base_64: "",
      commit: true,
      sample_rate: this.sampleRate,
    });
  }

  /**
   * Intentional close. onClose is NOT fired for this; it only reports
   * closes initiated by the server or the network.
   */
  close(): void {
    const socket = this.socket;
    const abort = this.abortConnect;
    this.generation++;
    this.teardown(false);
    this.currentState = "closed";
    if (socket) {
      try {
        socket.close(1000, "client closed");
      } catch {
        // already closing
      }
    }
    abort?.(new Error("Scribe client closed"));
  }

  private buildUrl(token: string): string {
    const params = new URLSearchParams();
    params.set("model_id", this.config.modelId);
    params.set("token", token);
    params.set("audio_format", this.config.audioFormat);
    if (this.config.languageCode) params.set("language_code", this.config.languageCode);
    params.set("commit_strategy", this.config.commitStrategy);
    if (this.config.vadSilenceThresholdSecs !== undefined) {
      params.set("vad_silence_threshold_secs", String(this.config.vadSilenceThresholdSecs));
    }
    const sep = this.config.url.includes("?") ? "&" : "?";
    return `${this.config.url}${sep}${params.toString()}`;
  }

  /** Reset to a closed state, optionally detaching the socket handlers. */
  private teardown(markClosed = true): void {
    const socket = this.socket;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    this.socket = null;
    this.connectPromise = null;
    this.abortConnect = null;
    if (markClosed) this.currentState = "closed";
  }

  private sendJson(payload: unknown): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WS_OPEN) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // Socket went away between the state check and send; onclose will follow.
    }
  }

  private handleMessage(data: unknown): void {
    let msg: ScribeMessage;
    try {
      if (typeof data !== "string") throw new Error("non-text frame");
      const parsed: unknown = JSON.parse(data);
      if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
      msg = parsed as ScribeMessage;
    } catch {
      if (!this.malformedReported) {
        this.malformedReported = true;
        this.callbacks.onError(new Error("Scribe sent a malformed message"));
      }
      return;
    }

    const type = typeof msg.message_type === "string" ? msg.message_type : "";
    if (type.includes("error") || msg.error !== undefined) {
      this.callbacks.onError(new Error(this.errorText(msg, type)));
      return;
    }

    const text = typeof msg.text === "string" ? msg.text : "";
    switch (type) {
      case "session_started":
        this.callbacks.onSessionStarted?.();
        break;
      case "partial_transcript":
        this.callbacks.onPartial(text);
        break;
      case "committed_transcript":
        // The "_with_timestamps" variant repeats the same text; ignore it.
        if (text.trim().length > 0) this.callbacks.onCommitted(text);
        break;
      default:
        break;
    }
  }

  private errorText(msg: ScribeMessage, type: string): string {
    if (typeof msg.error === "string" && msg.error) return msg.error;
    if (typeof msg.message === "string" && msg.message) return msg.message;
    return type || "Scribe error";
  }
}
