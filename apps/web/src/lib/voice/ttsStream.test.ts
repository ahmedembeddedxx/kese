import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtsStream } from "./ttsStream";
import type { TtsConfig } from "./ttsStream";
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

  serverCloses(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: "", wasClean: false });
  }

  /** Parsed outgoing messages. */
  get messages(): Record<string, unknown>[] {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

function b64(ints: number[]): string {
  const bytes = new Uint8Array(new Int16Array(ints).buffer);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function setup(overrides: Partial<TtsConfig> = {}) {
  const sockets: FakeWebSocket[] = [];
  let n = 0;
  const getToken = vi.fn<() => Promise<string>>(() => Promise.resolve(`tok-${++n}`));
  const cb = { onAudio: vi.fn(), onTurnEnd: vi.fn(), onError: vi.fn() };
  const config: TtsConfig = {
    url: "wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input",
    modelId: "eleven_v4_turbo",
    voiceId: "voice-1",
    outputFormat: "pcm_24000",
    languageCode: "ur",
    getToken,
    webSocketFactory: (url) => {
      const ws = new FakeWebSocket(url);
      sockets.push(ws);
      return ws;
    },
    ...overrides,
  };
  const tts = new TtsStream(config, cb);
  return { tts, sockets, getToken, cb };
}

type Harness = ReturnType<typeof setup>;

async function nextSocket(h: Harness, index = h.sockets.length): Promise<FakeWebSocket> {
  await vi.waitFor(() => expect(h.sockets.length).toBeGreaterThan(index));
  return h.sockets[index];
}

describe("TtsStream", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects lazily with the right url, sends voices first, then ordered inputs", async () => {
    const h = setup();
    expect(h.getToken).not.toHaveBeenCalled();
    h.tts.speak("پہلا جملہ۔");
    h.tts.speak("دوسرا جملہ۔");
    expect(h.tts.speaking).toBe(true);
    const ws = await nextSocket(h, 0);

    const url = new URL(ws.url);
    expect(url.origin + url.pathname).toBe("wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input");
    expect(url.searchParams.get("model_id")).toBe("eleven_v4_turbo");
    expect(url.searchParams.get("output_format")).toBe("pcm_24000");
    expect(url.searchParams.get("single_use_token")).toBe("tok-1");
    expect(url.searchParams.get("language_code")).toBe("ur");

    // Nothing is sent before the socket opens.
    expect(ws.send).not.toHaveBeenCalled();
    ws.open();
    expect(ws.messages).toEqual([
      { voices: ["voice-1"] },
      { inputs: [{ text: "پہلا جملہ۔", voice_id: "voice-1", new_turn: true }] },
      { inputs: [{ text: "دوسرا جملہ۔", voice_id: "voice-1", new_turn: false }] },
    ]);
    expect(h.sockets).toHaveLength(1);
    expect(h.getToken).toHaveBeenCalledTimes(1);
  });

  it("omits language_code when not configured", async () => {
    const h = setup({ languageCode: undefined });
    h.tts.speak("hello");
    const ws = await nextSocket(h, 0);
    expect(new URL(ws.url).searchParams.has("language_code")).toBe(false);
  });

  it("sends directly once open and ignores blank text", async () => {
    const h = setup();
    h.tts.speak("one");
    const ws = await nextSocket(h, 0);
    ws.open();
    h.tts.speak("   ");
    h.tts.speak("two");
    expect(ws.messages.slice(1)).toEqual([
      { inputs: [{ text: "one", voice_id: "voice-1", new_turn: true }] },
      { inputs: [{ text: "two", voice_id: "voice-1", new_turn: false }] },
    ]);
  });

  it("endTurn sends flush after queued text, even while still connecting", async () => {
    const h = setup();
    h.tts.speak("hello there");
    h.tts.endTurn();
    const ws = await nextSocket(h, 0);
    ws.open();
    expect(ws.messages).toEqual([
      { voices: ["voice-1"] },
      { inputs: [{ text: "hello there", voice_id: "voice-1", new_turn: true }] },
      { flush: true },
    ]);
  });

  it("endTurn without any speech does nothing", () => {
    const h = setup();
    h.tts.endTurn();
    expect(h.getToken).not.toHaveBeenCalled();
    expect(h.tts.speaking).toBe(false);
  });

  it("decodes audio and fires onTurnEnd on is_final_audio_for_turn", async () => {
    const h = setup();
    h.tts.speak("hello");
    const ws = await nextSocket(h, 0);
    ws.open();
    ws.serverSays({ audio: b64([1, -2, 3]) });
    expect(h.cb.onAudio).toHaveBeenCalledTimes(1);
    const buf = h.cb.onAudio.mock.calls[0][0] as ArrayBuffer;
    expect(Array.from(new Int16Array(buf))).toEqual([1, -2, 3]);

    h.tts.endTurn();
    expect(h.tts.speaking).toBe(true);
    ws.serverSays({ is_final_audio_for_turn: true });
    expect(h.cb.onTurnEnd).toHaveBeenCalledTimes(1);
    expect(h.tts.speaking).toBe(false);
    ws.serverSays({ is_final: true });
    expect(h.cb.onTurnEnd).toHaveBeenCalledTimes(1);
  });

  it("uses is_final to finish a flushed turn if no turn marker arrives", async () => {
    const h = setup();
    h.tts.speak("hello");
    h.tts.endTurn();
    const ws = await nextSocket(h, 0);
    ws.open();
    ws.serverSays({ is_final: true });
    expect(h.cb.onTurnEnd).toHaveBeenCalledTimes(1);
    expect(h.tts.speaking).toBe(false);
  });

  it("a stale is_final does not end a new turn", async () => {
    const h = setup();
    h.tts.speak("a");
    h.tts.endTurn();
    const ws = await nextSocket(h, 0);
    ws.open();
    ws.serverSays({ is_final_audio_for_turn: true });
    h.tts.speak("b");
    ws.serverSays({ is_final: true });
    expect(h.cb.onTurnEnd).toHaveBeenCalledTimes(1);
    expect(h.tts.speaking).toBe(true);
  });

  it("marks the first input of each new turn with new_turn true", async () => {
    const h = setup();
    h.tts.speak("a");
    const ws = await nextSocket(h, 0);
    ws.open();
    h.tts.endTurn();
    ws.serverSays({ is_final_audio_for_turn: true });
    h.tts.speak("b");
    h.tts.speak("c");
    const inputs = ws.messages.filter((m) => "inputs" in m) as { inputs: { new_turn: boolean }[] }[];
    expect(inputs.map((m) => m.inputs[0].new_turn)).toEqual([true, true, false]);
  });

  it("ignores empty audio payloads", async () => {
    const h = setup();
    h.tts.speak("a");
    const ws = await nextSocket(h, 0);
    ws.open();
    ws.serverSays({ audio: "" });
    ws.serverSays({ audio: null });
    expect(h.cb.onAudio).not.toHaveBeenCalled();
  });

  it("reports server errors and malformed json (once) without throwing", async () => {
    const h = setup();
    h.tts.speak("a");
    const ws = await nextSocket(h, 0);
    ws.open();
    ws.serverSays({ error: "quota", message: "out of credits", code: 429 });
    expect(h.cb.onError).toHaveBeenCalledTimes(1);
    expect(h.cb.onError.mock.calls[0][0].message).toBe("quota: out of credits");
    expect(() => ws.serverSays("{nope")).not.toThrow();
    ws.serverSays("nope again");
    expect(h.cb.onError).toHaveBeenCalledTimes(2);
  });

  it("sends keep_alive on the interval and stops after close()", async () => {
    vi.useFakeTimers();
    const h = setup({ keepAliveMs: 1000 });
    h.tts.speak("a");
    await vi.advanceTimersByTimeAsync(0);
    const ws = h.sockets[0];
    ws.open();
    const count = () => ws.messages.filter((m) => m.keep_alive === true).length;
    await vi.advanceTimersByTimeAsync(3100);
    expect(count()).toBe(3);
    h.tts.close();
    await vi.advanceTimersByTimeAsync(5000);
    expect(count()).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("defaults the keep-alive interval to 12 seconds", async () => {
    vi.useFakeTimers();
    const h = setup();
    h.tts.speak("a");
    await vi.advanceTimersByTimeAsync(0);
    const ws = h.sockets[0];
    ws.open();
    await vi.advanceTimersByTimeAsync(11_900);
    expect(ws.messages.some((m) => m.keep_alive)).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(ws.messages.some((m) => m.keep_alive)).toBe(true);
    h.tts.close();
  });

  it("stop() closes the socket, clears the timer and drops late audio", async () => {
    vi.useFakeTimers();
    const h = setup({ keepAliveMs: 1000 });
    h.tts.speak("a");
    await vi.advanceTimersByTimeAsync(0);
    const ws = h.sockets[0];
    ws.open();
    const onmessage = ws.onmessage;
    h.tts.stop();
    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(h.tts.speaking).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    // Even a handler captured before stop() must not deliver audio.
    onmessage?.({ data: JSON.stringify({ audio: b64([1, 2]) }) });
    ws.serverSays({ audio: b64([1, 2]) });
    expect(h.cb.onAudio).not.toHaveBeenCalled();
    expect(h.cb.onTurnEnd).not.toHaveBeenCalled();
    h.tts.stop();
    h.tts.stop();
    expect(ws.close).toHaveBeenCalledTimes(1);
  });

  it("speak() after stop() reconnects with a fresh token and a new turn", async () => {
    const h = setup();
    h.tts.speak("old");
    const first = await nextSocket(h, 0);
    first.open();
    h.tts.stop();
    h.tts.speak("new");
    const second = await nextSocket(h, 1);
    expect(h.getToken).toHaveBeenCalledTimes(2);
    expect(new URL(second.url).searchParams.get("single_use_token")).toBe("tok-2");
    second.open();
    expect(second.messages).toEqual([
      { voices: ["voice-1"] },
      { inputs: [{ text: "new", voice_id: "voice-1", new_turn: true }] },
    ]);
    // The old socket never receives anything new.
    expect(first.messages.some((m) => (m.inputs as { text: string }[] | undefined)?.[0]?.text === "new")).toBe(false);
  });

  it("stop() during the token fetch means nothing is sent or played later", async () => {
    let release: (t: string) => void = () => undefined;
    const h = setup({ getToken: () => new Promise<string>((r) => (release = r)) });
    h.tts.speak("never spoken");
    h.tts.stop();
    release("late");
    await Promise.resolve();
    await Promise.resolve();
    expect(h.sockets).toHaveLength(0);
    expect(h.cb.onAudio).not.toHaveBeenCalled();
  });

  it("stop() while the socket is connecting discards queued text and a late open", async () => {
    const h = setup();
    h.tts.speak("queued");
    const ws = await nextSocket(h, 0);
    h.tts.stop();
    ws.open();
    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledTimes(1);
  });

  it("a stale token from before stop() does not hijack the next speak()", async () => {
    const resolvers: ((t: string) => void)[] = [];
    const h = setup({ getToken: () => new Promise<string>((r) => resolvers.push(r)) });
    h.tts.speak("old");
    h.tts.stop();
    h.tts.speak("new");
    expect(resolvers).toHaveLength(2);
    resolvers[0]("stale");
    resolvers[1]("fresh");
    const ws = await nextSocket(h, 0);
    await Promise.resolve();
    expect(h.sockets).toHaveLength(1);
    expect(new URL(ws.url).searchParams.get("single_use_token")).toBe("fresh");
    ws.open();
    expect(ws.messages.filter((m) => m.inputs)).toHaveLength(1);
  });

  it("reports getToken failure, clears state and recovers on the next speak", async () => {
    let fail = true;
    const h = setup({
      getToken: () => (fail ? Promise.reject(new Error("no token")) : Promise.resolve("ok")),
    });
    h.tts.speak("a");
    await vi.waitFor(() => expect(h.cb.onError).toHaveBeenCalledTimes(1));
    expect(h.cb.onError.mock.calls[0][0].message).toBe("no token");
    expect(h.tts.speaking).toBe(false);
    fail = false;
    h.tts.speak("b");
    const ws = await nextSocket(h, 0);
    ws.open();
    expect(ws.messages[1]).toEqual({ inputs: [{ text: "b", voice_id: "voice-1", new_turn: true }] });
  });

  it("an unexpected close mid-speech reports an error and allows a reconnect", async () => {
    const h = setup();
    h.tts.speak("a");
    const ws = await nextSocket(h, 0);
    ws.open();
    ws.serverCloses(1011);
    expect(h.cb.onError).toHaveBeenCalledTimes(1);
    expect(h.tts.speaking).toBe(false);
    h.tts.speak("b");
    const ws2 = await nextSocket(h, 1);
    expect(h.getToken).toHaveBeenCalledTimes(2);
    ws2.open();
  });

  it("an idle drop (for example keep-alive timeout) is silent", async () => {
    const h = setup();
    h.tts.speak("a");
    const ws = await nextSocket(h, 0);
    ws.open();
    h.tts.endTurn();
    ws.serverSays({ is_final_audio_for_turn: true });
    ws.serverCloses(1000);
    expect(h.cb.onError).not.toHaveBeenCalled();
  });

  it("close() is permanent: later speak() does nothing", async () => {
    const h = setup();
    h.tts.close();
    h.tts.speak("a");
    h.tts.endTurn();
    await Promise.resolve();
    expect(h.getToken).not.toHaveBeenCalled();
    expect(h.tts.speaking).toBe(false);
  });
});
