// Thin wrapper around `@google/genai`'s Live API, opened directly from
// the browser with the ephemeral token `/session` minted (the real
// Gemini API key never reaches the phone, per the plan's architecture).
//
// The server locks model + config (system prompt, tools, modality,
// resumption, compression) into the ephemeral token and allows several
// uses, so this client can transparently reconnect with a session
// resumption handle when the socket drops or Gemini sends `goAway`.
//
// Two response modes:
//   AUDIO  Gemini speaks (native audio). Mic audio + video frames go up.
//   TEXT   Gemini replies with text which another provider speaks. No audio
//          is sent to Gemini and none comes back; only video frames + text.
//
// NOT YET EXERCISED AGAINST A LIVE SESSION (no Gemini API key is
// available in this environment). Field names below were checked against
// the installed `@google/genai` type declarations; what is unverified is
// the actual server behavior (resumption handle semantics, goAway timing).
// Never log audio or frames from this file.

import {
  type FunctionDeclaration,
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  Modality,
  type Session,
} from "@google/genai";

export type ResponseModality = "AUDIO" | "TEXT";

export interface LiveSessionCallbacks {
  /** AUDIO mode model audio (base64 PCM16 @ 24 kHz). */
  onAudioBase64?: (pcm16Base64: string) => void;
  /** TEXT mode: text parts of `serverContent.modelTurn`, each delta once. */
  onModelText?: (delta: string) => void;
  /** `serverContent.inputTranscription.text` delta. */
  onInputTranscript?: (text: string) => void;
  /** `serverContent.outputTranscription.text` delta. */
  onOutputTranscript?: (text: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>, callId: string) => void;
  onTurnComplete: () => void;
  /** `serverContent.interrupted`. */
  onInterrupted?: () => void;
  onReconnecting?: (attempt: number) => void;
  onReconnected?: () => void;
  onError: (error: unknown) => void;
  /** TERMINAL close only: manual `close()` or reconnect retries exhausted. */
  onClose: () => void;
}

export type LiveConnectFn = (params: {
  model: string;
  config: Record<string, unknown>;
  callbacks: {
    onopen?: () => void;
    onmessage: (m: LiveServerMessage) => void;
    onerror?: (e: unknown) => void;
    onclose?: (e: unknown) => void;
  };
}) => Promise<Session>;

export interface OpenLiveSessionArgs {
  ephemeralToken: string;
  model: string;
  responseModality: ResponseModality;
  /** Spread into the connect config. `tools` and `responseModalities` are set by the client. */
  liveConfig: Record<string, unknown>;
  toolDeclarations: Record<string, unknown>[];
  callbacks: LiveSessionCallbacks;
  /** Test seam. Default builds a GoogleGenAI client with the ephemeral token. */
  connectFn?: LiveConnectFn;
  /** Default 4. */
  maxReconnectAttempts?: number;
  /** Default min(8000, 500 * 2 ** (attempt - 1)). */
  backoffMs?: (attempt: number) => number;
}

export interface LiveSessionHandle {
  /** audio/pcm;rate=16000. No-op in TEXT mode or while reconnecting. */
  sendAudioChunkBase64: (pcm16Base64: string) => void;
  /** image/jpeg. Dropped (not queued) while reconnecting. */
  sendVideoFrameJpegBase64: (jpegBase64: string) => void;
  /** User text turn. Queued (max 8, oldest dropped) while reconnecting. */
  sendText: (text: string) => void;
  /** Queued while reconnecting. */
  sendToolResponse: (callId: string, response: Record<string, unknown>) => void;
  /** Manual, terminal, idempotent, no reconnect. */
  close: () => void;
}

const MAX_QUEUED_TEXT = 8;
const DEFAULT_MAX_RECONNECTS = 4;

function defaultBackoffMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** (attempt - 1));
}

function defaultConnectFn(ephemeralToken: string): LiveConnectFn {
  const client = new GoogleGenAI({
    apiKey: ephemeralToken,
    httpOptions: { apiVersion: "v1alpha" },
  });
  return (params) =>
    client.live.connect({
      model: params.model,
      config: params.config as unknown as LiveConnectConfig,
      callbacks: params.callbacks,
    });
}

/** Run a callback and swallow anything it throws so other dispatches survive. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // A misbehaving UI callback must never kill the message loop.
  }
}

function closeQuietly(session: Session | null): void {
  if (!session) return;
  try {
    session.close();
  } catch {
    // Already closed.
  }
}

type QueuedItem =
  | { kind: "text"; text: string }
  | { kind: "tool"; callId: string; response: Record<string, unknown> };

export async function openLiveSession(args: OpenLiveSessionArgs): Promise<LiveSessionHandle> {
  const { callbacks, responseModality } = args;
  const connectFn = args.connectFn ?? defaultConnectFn(args.ephemeralToken);
  const maxReconnects = args.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECTS;
  const backoffMs = args.backoffMs ?? defaultBackoffMs;

  let session: Session | null = null;
  let resumptionHandle: string | null = null;
  let closed = false;
  let reconnecting = false;
  let generation = 0;
  let queue: QueuedItem[] = [];
  let cancelSleep: (() => void) | null = null;

  function buildConfig(handle: string | null): Record<string, unknown> {
    const config: Record<string, unknown> = {
      ...args.liveConfig,
      responseModalities: [responseModality === "AUDIO" ? Modality.AUDIO : Modality.TEXT],
      tools: [{ functionDeclarations: args.toolDeclarations as unknown as FunctionDeclaration[] }],
    };
    if (handle) {
      const existing = args.liveConfig.sessionResumption;
      config.sessionResumption = {
        ...(existing && typeof existing === "object" ? existing : {}),
        handle,
      };
    }
    return config;
  }

  function dispatch(message: LiveServerMessage): void {
    if (closed) return;
    const update = message.sessionResumptionUpdate;
    if (update && update.resumable !== false && update.newHandle) {
      resumptionHandle = update.newHandle;
    }

    const content = message.serverContent;
    if (content?.interrupted) {
      safely(() => callbacks.onInterrupted?.());
    }
    if (responseModality === "AUDIO") {
      const audio = message.data;
      if (audio) safely(() => callbacks.onAudioBase64?.(audio));
    } else {
      // Read parts directly: `message.text` is a getter over the same parts,
      // so using both would duplicate every delta.
      for (const part of content?.modelTurn?.parts ?? []) {
        const text = part.text;
        if (typeof text === "string" && text.length > 0 && !part.thought) {
          safely(() => callbacks.onModelText?.(text));
        }
      }
    }
    const inText = content?.inputTranscription?.text;
    if (inText) safely(() => callbacks.onInputTranscript?.(inText));
    const outText = content?.outputTranscription?.text;
    if (outText) safely(() => callbacks.onOutputTranscript?.(outText));

    for (const call of message.toolCall?.functionCalls ?? []) {
      safely(() => callbacks.onToolCall(call.name ?? "", call.args ?? {}, call.id ?? ""));
    }
    if (content?.turnComplete) {
      safely(() => callbacks.onTurnComplete());
    }
    if (message.goAway) {
      void reconnect();
    }
  }

  /** One connect attempt. Rejects if it fails before the socket is usable. */
  function connectOnce(handle: string | null): Promise<Session> {
    const myGeneration = ++generation;
    return new Promise<Session>((resolve, reject) => {
      let pending = true;
      const fail = (error: unknown) => {
        if (!pending) return;
        pending = false;
        reject(error);
      };
      connectFn({
        model: args.model,
        config: buildConfig(handle),
        callbacks: {
          onopen: () => {},
          onmessage: (m) => {
            if (myGeneration !== generation) return;
            try {
              dispatch(m);
            } catch {
              // Never throw from the message handler.
            }
          },
          onerror: (e) => {
            if (pending) fail(e);
            else if (myGeneration === generation) void reconnect();
          },
          onclose: (e) => {
            if (pending) fail(e instanceof Error ? e : new Error("Live socket closed before it opened"));
            else if (myGeneration === generation) void reconnect();
          },
        },
      }).then(
        (s) => {
          if (!pending) {
            // The attempt already failed or was abandoned; do not leak the socket.
            closeQuietly(s);
            return;
          }
          pending = false;
          resolve(s);
        },
        (e) => fail(e),
      );
    });
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cancelSleep = null;
        resolve();
      }, ms);
      cancelSleep = () => {
        clearTimeout(timer);
        cancelSleep = null;
        resolve();
      };
    });
  }

  async function reconnect(): Promise<void> {
    if (closed || reconnecting) return;
    reconnecting = true;
    generation++; // ignore any further events from the old socket
    const old = session;
    session = null;
    closeQuietly(old);

    for (let attempt = 1; attempt <= maxReconnects; attempt++) {
      safely(() => callbacks.onReconnecting?.(attempt));
      await sleep(backoffMs(attempt));
      if (closed) return;
      let next: Session;
      try {
        next = await connectOnce(resumptionHandle);
      } catch {
        if (closed) return;
        continue;
      }
      if (closed) {
        closeQuietly(next);
        return;
      }
      session = next;
      reconnecting = false;
      // Flush first so anything the onReconnected callback sends goes after
      // the queued items, preserving order.
      flushQueue();
      safely(() => callbacks.onReconnected?.());
      return;
    }

    // Retries exhausted: terminal.
    reconnecting = false;
    closed = true;
    queue = [];
    safely(() => callbacks.onError(new Error("Live session lost and reconnect attempts were exhausted")));
    safely(() => callbacks.onClose());
  }

  function sendNow(item: QueuedItem): void {
    if (!session) throw new Error("no session");
    if (item.kind === "text") {
      session.sendRealtimeInput({ text: item.text });
    } else {
      session.sendToolResponse({ functionResponses: [{ id: item.callId, response: item.response }] });
    }
  }

  function enqueue(item: QueuedItem): void {
    if (item.kind === "text") {
      const texts = queue.filter((q) => q.kind === "text");
      if (texts.length >= MAX_QUEUED_TEXT) {
        const oldest = texts[0];
        queue = queue.filter((q) => q !== oldest);
      }
    }
    queue.push(item);
  }

  function flushQueue(): void {
    while (queue.length > 0 && session && !reconnecting && !closed) {
      const item = queue[0]!;
      try {
        sendNow(item);
      } catch {
        void reconnect();
        return;
      }
      queue.shift();
    }
  }

  function sendOrQueue(item: QueuedItem): void {
    if (closed) return;
    if (reconnecting || !session) {
      enqueue(item);
      return;
    }
    try {
      sendNow(item);
    } catch {
      enqueue(item);
      void reconnect();
    }
  }

  // Initial connect: no retries. A failure rejects so the caller can fall
  // back to another voice provider.
  const first = await connectOnce(null);
  session = first;

  let manualCloseDone = false;
  return {
    sendAudioChunkBase64: (pcm16Base64) => {
      if (closed || reconnecting || !session || responseModality === "TEXT") return;
      try {
        session.sendRealtimeInput({ audio: { data: pcm16Base64, mimeType: "audio/pcm;rate=16000" } });
      } catch {
        // Socket is going away; the close handler will reconnect.
      }
    },
    sendVideoFrameJpegBase64: (jpegBase64) => {
      if (closed || reconnecting || !session) return;
      try {
        session.sendRealtimeInput({ video: { data: jpegBase64, mimeType: "image/jpeg" } });
      } catch {
        // Dropped on purpose; frames are not worth queueing.
      }
    },
    sendText: (text) => sendOrQueue({ kind: "text", text }),
    sendToolResponse: (callId, response) => sendOrQueue({ kind: "tool", callId, response }),
    close: () => {
      if (manualCloseDone) return;
      manualCloseDone = true;
      const wasClosed = closed;
      closed = true;
      generation++; // the socket's own close event must not trigger a reconnect
      queue = [];
      cancelSleep?.();
      const current = session;
      session = null;
      closeQuietly(current);
      // If retries were already exhausted, onClose has been delivered.
      if (!wasClosed) safely(() => callbacks.onClose());
    },
  };
}
