import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScribeClient } from "./scribeClient";
import type { ScribeCallbacks, ScribeConfig } from "./scribeClient";
import type { WebSocketLike } from "./types";

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  send = vi.fn((data: string) => {
    this.sent.push(data);
  });
  close = vi.fn((_code?: number, _reason?: string) => {
    this.readyState = 3;
  });
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onerror: WebSocketLike["onerror"] = null;
  onclose: WebSocketLike["onclose"] = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  serverSays(payload: unknown): void {
    this.onmessage?.({ data: typeof payload === "string" ? payload : JSON.stringify(payload) });
  }

  serverCloses(code = 1006, reason = "gone"): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: false });
  }
}

interface Harness {
  client: ScribeClient;
  sockets: FakeWebSocket[];
  getToken: ReturnType<typeof vi.fn<() => Promise<string>>>;
  cb: {
    onSessionStarted: ReturnType<typeof vi.fn>;
    onPartial: ReturnType<typeof vi.fn>;
    onCommitted: ReturnType<typeof vi.fn>;
    onError: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  };
}

function setup(overrides: Partial<ScribeConfig> = {}): Harness {
  const sockets: FakeWebSocket[] = [];
  let n = 0;
  const getToken = vi.fn<() => Promise<string>>(() => Promise.resolve(`tok-${++n}`));
  const cb = {
    onSessionStarted: vi.fn(),
    onPartial: vi.fn(),
    onCommitted: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
  };
  const config: ScribeConfig = {
    url: "wss://api.elevenlabs.io/v1/speech-to-text/realtime",
    modelId: "scribe_v2_realtime",
    languageCode: "urd",
    audioFormat: "pcm_16000",
    commitStrategy: "vad",
    vadSilenceThresholdSecs: 1.2,
    getToken,
    webSocketFactory: (url) => {
      const ws = new FakeWebSocket(url);
      sockets.push(ws);
      return ws;
    },
    ...overrides,
  };
  const callbacks: ScribeCallbacks = cb;
  return { client: new ScribeClient(config, callbacks), sockets, getToken, cb };
}

async function connectOpen(h: Harness): Promise<FakeWebSocket> {
  const p = h.client.connect();
  await vi.waitFor(() => expect(h.sockets.length).toBeGreaterThan(0));
  const ws = h.sockets[h.sockets.length - 1];
  ws.open();
  await p;
  return ws;
}

describe("ScribeClient", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts idle and connects with the right url and a fresh token", async () => {
    const h = setup();
    expect(h.client.state).toBe("idle");
    const p = h.client.connect();
    expect(h.client.state).toBe("connecting");
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1));
    const url = new URL(h.sockets[0].url);
    expect(url.origin + url.pathname).toBe("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
    expect(url.searchParams.get("model_id")).toBe("scribe_v2_realtime");
    expect(url.searchParams.get("token")).toBe("tok-1");
    expect(url.searchParams.get("audio_format")).toBe("pcm_16000");
    expect(url.searchParams.get("language_code")).toBe("urd");
    expect(url.searchParams.get("commit_strategy")).toBe("vad");
    expect(url.searchParams.get("vad_silence_threshold_secs")).toBe("1.2");
    h.sockets[0].open();
    await p;
    expect(h.client.state).toBe("open");
  });

  it("omits the vad threshold when not configured", async () => {
    const h = setup({ vadSilenceThresholdSecs: undefined });
    const p = h.client.connect();
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1));
    expect(new URL(h.sockets[0].url).searchParams.has("vad_silence_threshold_secs")).toBe(false);
    h.sockets[0].open();
    await p;
  });

  it("rejects connect() when getToken rejects and opens no socket", async () => {
    const h = setup({ getToken: () => Promise.reject(new Error("no token")) });
    await expect(h.client.connect()).rejects.toThrow("no token");
    expect(h.sockets).toHaveLength(0);
    expect(h.client.state).toBe("closed");
  });

  it("rejects connect() when the socket errors before opening", async () => {
    const h = setup();
    const p = h.client.connect();
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1));
    h.sockets[0].onerror?.({});
    await expect(p).rejects.toThrow();
    expect(h.client.state).toBe("closed");
  });

  it("returns the same pending promise for a double connect and one socket", async () => {
    const h = setup();
    const p1 = h.client.connect();
    const p2 = h.client.connect();
    expect(p2).toBe(p1);
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1));
    h.sockets[0].open();
    await Promise.all([p1, p2]);
    await h.client.connect();
    expect(h.sockets).toHaveLength(1);
    expect(h.getToken).toHaveBeenCalledTimes(1);
  });

  it("fetches a new token when reconnecting after a close", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    ws.serverCloses();
    expect(h.client.state).toBe("closed");
    await connectOpen(h);
    expect(h.getToken).toHaveBeenCalledTimes(2);
    expect(new URL(h.sockets[1].url).searchParams.get("token")).toBe("tok-2");
  });

  it("sends the exact bytes of an Int16Array view as base64 with commit false", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    const backing = new Int16Array([9, 9, 1, -2, 300, 9]);
    const view = backing.subarray(2, 5); // 1, -2, 300
    h.client.sendAudio(view);
    expect(ws.send).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(ws.sent[0]);
    expect(msg.message_type).toBe("input_audio_chunk");
    expect(msg.commit).toBe(false);
    expect(msg.sample_rate).toBe(16000);
    const bytes = Uint8Array.from(atob(msg.audio_base_64), (c) => c.charCodeAt(0));
    expect(Array.from(new Int16Array(bytes.buffer))).toEqual([1, -2, 300]);
  });

  it("honours a custom sample rate and ignores empty audio", async () => {
    const h = setup({ sampleRate: 8000 });
    const ws = await connectOpen(h);
    h.client.sendAudio(new Int16Array(0));
    expect(ws.send).not.toHaveBeenCalled();
    h.client.sendAudio(new Int16Array([1]));
    expect(JSON.parse(ws.sent[0]).sample_rate).toBe(8000);
  });

  it("commit() sends an empty chunk with commit true", async () => {
    const h = setup({ commitStrategy: "manual" });
    const ws = await connectOpen(h);
    h.client.commit();
    expect(JSON.parse(ws.sent[0])).toEqual({
      message_type: "input_audio_chunk",
      audio_base_64: "",
      commit: true,
      sample_rate: 16000,
    });
  });

  it("sendAudio and commit are silent no-ops before open and after close", async () => {
    const h = setup();
    expect(() => h.client.sendAudio(new Int16Array([1, 2]))).not.toThrow();
    expect(() => h.client.commit()).not.toThrow();
    const ws = await connectOpen(h);
    h.client.close();
    expect(h.client.state).toBe("closed");
    expect(() => h.client.sendAudio(new Int16Array([1, 2]))).not.toThrow();
    expect(() => h.client.commit()).not.toThrow();
    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledTimes(1);
  });

  it("sendAudio swallows a throwing socket", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    ws.send.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => h.client.sendAudio(new Int16Array([1, 2]))).not.toThrow();
  });

  it("routes transcripts and session_started", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    ws.serverSays({ message_type: "session_started", session_id: "s1", config: {} });
    ws.serverSays({ message_type: "partial_transcript", text: "پنکھا" });
    ws.serverSays({ message_type: "committed_transcript", text: "پنکھا نہیں چل رہا" });
    expect(h.cb.onSessionStarted).toHaveBeenCalledTimes(1);
    expect(h.cb.onPartial).toHaveBeenCalledWith("پنکھا");
    expect(h.cb.onCommitted).toHaveBeenCalledWith("پنکھا نہیں چل رہا");
    expect(h.cb.onError).not.toHaveBeenCalled();
  });

  it("handles transcripts that arrive before session_started", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    ws.serverSays({ message_type: "partial_transcript", text: "hello" });
    expect(h.cb.onPartial).toHaveBeenCalledWith("hello");
    expect(h.cb.onSessionStarted).not.toHaveBeenCalled();
  });

  it("does not double count the with_timestamps variant or empty commits", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    ws.serverSays({ message_type: "committed_transcript", text: "ok" });
    ws.serverSays({
      message_type: "committed_transcript_with_timestamps",
      text: "ok",
      language_code: "urd",
      words: [],
    });
    ws.serverSays({ message_type: "committed_transcript", text: "  " });
    expect(h.cb.onCommitted).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown message types", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    ws.serverSays({ message_type: "something_new", text: "x" });
    expect(h.cb.onPartial).not.toHaveBeenCalled();
    expect(h.cb.onError).not.toHaveBeenCalled();
  });

  it("reports malformed JSON once and never throws", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    expect(() => ws.serverSays("{not json")).not.toThrow();
    ws.serverSays("also bad");
    ws.onmessage?.({ data: new ArrayBuffer(4) });
    expect(h.cb.onError).toHaveBeenCalledTimes(1);
    ws.serverSays({ message_type: "partial_transcript", text: "still works" });
    expect(h.cb.onPartial).toHaveBeenCalledWith("still works");
  });

  it("treats error message types and error keys as errors", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    ws.serverSays({ message_type: "auth_error", error: "bad token" });
    ws.serverSays({ message_type: "quota_exceeded_error", message: "out of credits" });
    ws.serverSays({ message_type: "weird", error: { detail: 1 } });
    expect(h.cb.onError).toHaveBeenCalledTimes(3);
    expect(h.cb.onError.mock.calls[0][0].message).toBe("bad token");
    expect(h.cb.onError.mock.calls[1][0].message).toBe("out of credits");
    expect(h.cb.onError.mock.calls[2][0]).toBeInstanceOf(Error);
  });

  it("reports a server close once through onClose", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    ws.serverCloses(1011, "server error");
    expect(h.cb.onClose).toHaveBeenCalledWith({ code: 1011, reason: "server error", wasClean: false });
    expect(h.client.state).toBe("closed");
  });

  it("reports a socket error after open through onError", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    ws.onerror?.({});
    expect(h.cb.onError).toHaveBeenCalledTimes(1);
    expect(h.client.state).toBe("open");
  });

  it("close() during the token fetch cancels the connect and opens no socket", async () => {
    let release: (t: string) => void = () => undefined;
    const h = setup({ getToken: () => new Promise<string>((r) => (release = r)) });
    const p = h.client.connect();
    const settled = expect(p).rejects.toThrow();
    h.client.close();
    release("late");
    await settled;
    expect(h.sockets).toHaveLength(0);
    expect(h.client.state).toBe("closed");
  });

  it("close() while the socket is connecting rejects and ignores a late open", async () => {
    const h = setup();
    const p = h.client.connect();
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1));
    const settled = expect(p).rejects.toThrow();
    h.client.close();
    h.sockets[0].open();
    await settled;
    expect(h.client.state).toBe("closed");
    expect(h.cb.onClose).not.toHaveBeenCalled();
  });

  it("does not report onClose or messages after an intentional close", async () => {
    const h = setup();
    const ws = await connectOpen(h);
    h.client.close();
    ws.serverCloses();
    ws.serverSays({ message_type: "partial_transcript", text: "late" });
    expect(h.cb.onClose).not.toHaveBeenCalled();
    expect(h.cb.onPartial).not.toHaveBeenCalled();
  });
});
