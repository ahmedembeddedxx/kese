import type { LiveServerMessage, Session } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type LiveConnectFn,
  type LiveSessionCallbacks,
  type OpenLiveSessionArgs,
  openLiveSession,
} from "./geminiLiveClient";

type ConnectParams = Parameters<LiveConnectFn>[0];

interface FakeSession {
  sendRealtimeInput: ReturnType<typeof vi.fn>;
  sendToolResponse: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface Conn {
  params: ConnectParams;
  session: FakeSession;
  push: (m: Record<string, unknown>) => void;
  drop: () => void;
  error: () => void;
}

function makeHarness() {
  const conns: Conn[] = [];
  const attempts: ConnectParams[] = [];
  const state = { failNext: 0 };
  const connectFn: LiveConnectFn = async (params) => {
    attempts.push(params);
    if (state.failNext > 0) {
      state.failNext--;
      throw new Error("connect failed");
    }
    const session: FakeSession = {
      sendRealtimeInput: vi.fn(),
      sendToolResponse: vi.fn(),
      close: vi.fn(),
    };
    conns.push({
      params,
      session,
      push: (m) => params.callbacks.onmessage(m as unknown as LiveServerMessage),
      drop: () => params.callbacks.onclose?.({ code: 1006 }),
      error: () => params.callbacks.onerror?.(new Error("socket error")),
    });
    return session as unknown as Session;
  };
  return { conns, attempts, state, connectFn };
}

function makeCallbacks() {
  const cb = {
    onAudioBase64: vi.fn(),
    onModelText: vi.fn(),
    onInputTranscript: vi.fn(),
    onOutputTranscript: vi.fn(),
    onToolCall: vi.fn(),
    onTurnComplete: vi.fn(),
    onInterrupted: vi.fn(),
    onReconnecting: vi.fn(),
    onReconnected: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
  };
  return cb satisfies LiveSessionCallbacks;
}

type Callbacks = ReturnType<typeof makeCallbacks>;

async function open(
  overrides: Partial<OpenLiveSessionArgs> & { connectFn: LiveConnectFn },
  callbacks: Callbacks = makeCallbacks(),
) {
  const handle = await openLiveSession({
    ephemeralToken: "ephemeral-token",
    model: "models/test-live",
    responseModality: "AUDIO",
    liveConfig: { speechConfig: { languageCode: "ur-PK" } },
    toolDeclarations: [{ name: "highlight" }],
    callbacks,
    backoffMs: () => 100,
    ...overrides,
  });
  return { handle, callbacks };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("config merge", () => {
  it("adds tools and modality on top of liveConfig", async () => {
    const h = makeHarness();
    await open({
      connectFn: h.connectFn,
      liveConfig: {
        speechConfig: { languageCode: "ur-PK" },
        inputAudioTranscription: {},
        sessionResumption: {},
        responseModalities: ["TEXT"],
        tools: [{ googleSearch: {} }],
      },
    });
    const { model, config } = h.attempts[0]!;
    expect(model).toBe("models/test-live");
    expect(config.speechConfig).toEqual({ languageCode: "ur-PK" });
    expect(config.inputAudioTranscription).toEqual({});
    // liveConfig must not override the requested modality or tools.
    expect(config.responseModalities).toEqual(["AUDIO"]);
    expect(config.tools).toEqual([{ functionDeclarations: [{ name: "highlight" }] }]);
    expect((config.sessionResumption as { handle?: string }).handle).toBeUndefined();
  });

  it("uses the TEXT modality when asked", async () => {
    const h = makeHarness();
    await open({ connectFn: h.connectFn, responseModality: "TEXT" });
    expect(h.attempts[0]!.config.responseModalities).toEqual(["TEXT"]);
  });

  it("passes the latest resumption handle on reconnect, merged with existing config", async () => {
    const h = makeHarness();
    await open({
      connectFn: h.connectFn,
      liveConfig: { sessionResumption: { transparent: true }, speechConfig: { languageCode: "ur-PK" } },
    });
    h.conns[0]!.push({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } });
    h.conns[0]!.push({ sessionResumptionUpdate: { newHandle: "h2", resumable: true } });
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.attempts).toHaveLength(2);
    const cfg = h.attempts[1]!.config;
    expect(cfg.sessionResumption).toEqual({ transparent: true, handle: "h2" });
    expect(cfg.speechConfig).toEqual({ languageCode: "ur-PK" });
    expect(cfg.responseModalities).toEqual(["AUDIO"]);
    expect(cfg.tools).toEqual([{ functionDeclarations: [{ name: "highlight" }] }]);
  });

  it("ignores non-resumable updates", async () => {
    const h = makeHarness();
    await open({ connectFn: h.connectFn });
    h.conns[0]!.push({ sessionResumptionUpdate: { newHandle: "good", resumable: true } });
    h.conns[0]!.push({ sessionResumptionUpdate: { newHandle: "bad", resumable: false } });
    h.conns[0]!.push({ sessionResumptionUpdate: { resumable: true } });
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(100);
    expect((h.attempts[1]!.config.sessionResumption as { handle?: string }).handle).toBe("good");
  });

  it("reconnects without a handle when none was received", async () => {
    const h = makeHarness();
    await open({ connectFn: h.connectFn });
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.attempts).toHaveLength(2);
    expect(h.attempts[1]!.config.sessionResumption).toBeUndefined();
  });
});

describe("message routing", () => {
  it("routes model audio in AUDIO mode and ignores text parts", async () => {
    const h = makeHarness();
    const { callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.push({ data: "QVVESU8=", serverContent: { modelTurn: { parts: [{ text: "hi" }] } } });
    expect(callbacks.onAudioBase64).toHaveBeenCalledExactlyOnceWith("QVVESU8=");
    expect(callbacks.onModelText).not.toHaveBeenCalled();
  });

  it("routes text parts once in TEXT mode and ignores audio", async () => {
    const h = makeHarness();
    const { callbacks } = await open({ connectFn: h.connectFn, responseModality: "TEXT" });
    h.conns[0]!.push({
      // `text` mirrors the SDK getter that concatenates the same parts.
      text: "Switch off the breaker.",
      data: "QVVESU8=",
      serverContent: {
        modelTurn: {
          parts: [{ text: "Switch off " }, { text: "the breaker." }, { text: "hidden", thought: true }],
        },
      },
    });
    expect(callbacks.onModelText.mock.calls).toEqual([["Switch off "], ["the breaker."]]);
    expect(callbacks.onAudioBase64).not.toHaveBeenCalled();
  });

  it("routes input and output transcripts", async () => {
    const h = makeHarness();
    const { callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.push({ serverContent: { inputTranscription: { text: "paani" } } });
    h.conns[0]!.push({ serverContent: { outputTranscription: { text: "theek hai" } } });
    h.conns[0]!.push({ serverContent: { inputTranscription: { text: "" } } });
    expect(callbacks.onInputTranscript.mock.calls).toEqual([["paani"]]);
    expect(callbacks.onOutputTranscript.mock.calls).toEqual([["theek hai"]]);
  });

  it("reports interruptions", async () => {
    const h = makeHarness();
    const { callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.push({ serverContent: { interrupted: true } });
    expect(callbacks.onInterrupted).toHaveBeenCalledOnce();
    expect(callbacks.onTurnComplete).not.toHaveBeenCalled();
  });

  it("dispatches each function call with name, args and id", async () => {
    const h = makeHarness();
    const { callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.push({
      toolCall: {
        functionCalls: [
          { id: "c1", name: "highlight", args: { label: "MCB" } },
          { id: "c2", name: "clear_highlights" },
        ],
      },
    });
    expect(callbacks.onToolCall.mock.calls).toEqual([
      ["highlight", { label: "MCB" }, "c1"],
      ["clear_highlights", {}, "c2"],
    ]);
  });

  it("dispatches a multi-field serverContent in order, turnComplete last", async () => {
    const h = makeHarness();
    const order: string[] = [];
    const callbacks = makeCallbacks();
    callbacks.onAudioBase64.mockImplementation(() => order.push("audio"));
    callbacks.onInputTranscript.mockImplementation(() => order.push("in"));
    callbacks.onOutputTranscript.mockImplementation(() => order.push("out"));
    callbacks.onTurnComplete.mockImplementation(() => order.push("done"));
    await open({ connectFn: h.connectFn }, callbacks);
    h.conns[0]!.push({
      data: "QQ==",
      serverContent: {
        inputTranscription: { text: "a" },
        outputTranscription: { text: "b" },
        turnComplete: true,
      },
    });
    expect(order).toEqual(["audio", "in", "out", "done"]);
  });
});

describe("outgoing media", () => {
  it("sends audio and video with the right mime types", async () => {
    const h = makeHarness();
    const { handle } = await open({ connectFn: h.connectFn });
    handle.sendAudioChunkBase64("AAA=");
    handle.sendVideoFrameJpegBase64("JPG=");
    expect(h.conns[0]!.session.sendRealtimeInput.mock.calls).toEqual([
      [{ audio: { data: "AAA=", mimeType: "audio/pcm;rate=16000" } }],
      [{ video: { data: "JPG=", mimeType: "image/jpeg" } }],
    ]);
  });

  it("does not send audio in TEXT mode but still sends video and text", async () => {
    const h = makeHarness();
    const { handle } = await open({ connectFn: h.connectFn, responseModality: "TEXT" });
    handle.sendAudioChunkBase64("AAA=");
    handle.sendVideoFrameJpegBase64("JPG=");
    handle.sendText("hello");
    expect(h.conns[0]!.session.sendRealtimeInput.mock.calls).toEqual([
      [{ video: { data: "JPG=", mimeType: "image/jpeg" } }],
      [{ text: "hello" }],
    ]);
  });

  it("sends tool responses with the call id", async () => {
    const h = makeHarness();
    const { handle } = await open({ connectFn: h.connectFn });
    handle.sendToolResponse("c1", { ok: true });
    expect(h.conns[0]!.session.sendToolResponse).toHaveBeenCalledExactlyOnceWith({
      functionResponses: [{ id: "c1", response: { ok: true } }],
    });
  });
});

describe("reconnect", () => {
  it("reconnects on goAway", async () => {
    const h = makeHarness();
    const { callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.push({ goAway: { timeLeft: "10s" } });
    expect(callbacks.onReconnecting).toHaveBeenCalledExactlyOnceWith(1);
    expect(callbacks.onReconnected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.conns).toHaveLength(2);
    expect(h.conns[0]!.session.close).toHaveBeenCalled();
    expect(callbacks.onReconnected).toHaveBeenCalledOnce();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("reconnects on an unexpected close using the default exponential backoff", async () => {
    const h = makeHarness();
    const callbacks = makeCallbacks();
    const handle = await openLiveSession({
      ephemeralToken: "t",
      model: "m",
      responseModality: "AUDIO",
      liveConfig: {},
      toolDeclarations: [],
      callbacks,
      connectFn: h.connectFn,
    });
    h.state.failNext = 1;
    h.conns[0]!.drop();
    expect(callbacks.onReconnecting).toHaveBeenLastCalledWith(1);

    await vi.advanceTimersByTimeAsync(499);
    expect(h.attempts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.attempts).toHaveLength(2); // attempt 1 fired after 500ms and failed
    expect(callbacks.onReconnecting).toHaveBeenLastCalledWith(2);

    await vi.advanceTimersByTimeAsync(999);
    expect(h.attempts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.attempts).toHaveLength(3); // attempt 2 after 1000ms succeeded
    expect(callbacks.onReconnected).toHaveBeenCalledOnce();

    handle.sendText("after");
    expect(h.conns[1]!.session.sendRealtimeInput).toHaveBeenCalledWith({ text: "after" });
  });

  it("treats a post-connect socket error like a drop, without double reconnecting", async () => {
    const h = makeHarness();
    const { callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.error();
    h.conns[0]!.drop(); // the close that follows the error
    await vi.advanceTimersByTimeAsync(100);
    expect(h.conns).toHaveLength(2);
    expect(callbacks.onReconnecting).toHaveBeenCalledOnce();
  });

  it("ignores messages and closes from a replaced socket", async () => {
    const h = makeHarness();
    const { callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(100);
    h.conns[0]!.push({ data: "STALE" });
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.onAudioBase64).not.toHaveBeenCalled();
    expect(h.conns).toHaveLength(2);
  });

  it("resets the attempt counter after a successful reconnect", async () => {
    const h = makeHarness();
    const { callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(100);
    h.conns[1]!.drop();
    expect(callbacks.onReconnecting.mock.calls).toEqual([[1], [1]]);
  });

  it("calls onError once then onClose once when retries are exhausted", async () => {
    const h = makeHarness();
    const order: string[] = [];
    const callbacks = makeCallbacks();
    callbacks.onError.mockImplementation(() => order.push("error"));
    callbacks.onClose.mockImplementation(() => order.push("close"));
    const { handle } = await open({ connectFn: h.connectFn, maxReconnectAttempts: 3 }, callbacks);
    h.state.failNext = 99;
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.attempts).toHaveLength(4); // 1 initial + 3 retries
    expect(callbacks.onReconnecting.mock.calls).toEqual([[1], [2], [3]]);
    expect(callbacks.onReconnected).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(callbacks.onError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(order).toEqual(["error", "close"]);

    // Later manual close must not notify again.
    handle.close();
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledOnce();
  });

  it("does not reconnect again after retries are exhausted", async () => {
    const h = makeHarness();
    await open({ connectFn: h.connectFn, maxReconnectAttempts: 1 });
    h.state.failNext = 99;
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(10_000);
    const count = h.attempts.length;
    h.conns[0]!.drop();
    h.conns[0]!.push({ goAway: {} });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.attempts).toHaveLength(count);
  });
});

describe("manual close", () => {
  it("closes the session, calls onClose once and is idempotent", async () => {
    const h = makeHarness();
    const { handle, callbacks } = await open({ connectFn: h.connectFn });
    handle.close();
    handle.close();
    expect(h.conns[0]!.session.close).toHaveBeenCalledOnce();
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    // The socket's own close event must not trigger a reconnect.
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.attempts).toHaveLength(1);
    expect(callbacks.onReconnecting).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("makes sends no-ops after close", async () => {
    const h = makeHarness();
    const { handle } = await open({ connectFn: h.connectFn });
    handle.close();
    handle.sendText("x");
    handle.sendAudioChunkBase64("x");
    handle.sendVideoFrameJpegBase64("x");
    handle.sendToolResponse("c", {});
    expect(h.conns[0]!.session.sendRealtimeInput).not.toHaveBeenCalled();
    expect(h.conns[0]!.session.sendToolResponse).not.toHaveBeenCalled();
  });

  it("cancels a pending retry", async () => {
    const h = makeHarness();
    const { handle, callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(50);
    handle.close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.attempts).toHaveLength(1);
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(callbacks.onReconnected).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("closes a socket that finished connecting after close()", async () => {
    const h = makeHarness();
    let release: (() => void) | undefined;
    const slowConnect: LiveConnectFn = async (params) => {
      if (h.attempts.length >= 1) {
        await new Promise<void>((r) => {
          release = r;
        });
      }
      return h.connectFn(params);
    };
    const { handle } = await open({ connectFn: slowConnect });
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(100); // retry now awaiting the socket
    handle.close();
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.conns).toHaveLength(2);
    expect(h.conns[1]!.session.close).toHaveBeenCalled();
  });
});

describe("queueing while reconnecting", () => {
  it("flushes queued text and tool responses in order after reconnect", async () => {
    const h = makeHarness();
    const { handle, callbacks } = await open({ connectFn: h.connectFn });
    h.conns[0]!.drop();
    handle.sendText("first");
    handle.sendToolResponse("c1", { ok: 1 });
    handle.sendText("second");
    expect(h.conns[0]!.session.sendRealtimeInput).not.toHaveBeenCalled();
    expect(h.conns[0]!.session.sendToolResponse).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    const s = h.conns[1]!.session;
    expect(s.sendRealtimeInput.mock.calls).toEqual([[{ text: "first" }], [{ text: "second" }]]);
    expect(s.sendToolResponse.mock.calls).toEqual([[{ functionResponses: [{ id: "c1", response: { ok: 1 } }] }]]);
    expect(callbacks.onReconnected).toHaveBeenCalledOnce();
  });

  it("preserves interleaved order across text and tool responses", async () => {
    const h = makeHarness();
    const { handle } = await open({ connectFn: h.connectFn });
    h.conns[0]!.drop();
    handle.sendText("a");
    handle.sendToolResponse("c1", {});
    handle.sendText("b");

    await vi.advanceTimersByTimeAsync(100);
    const s = h.conns[1]!.session;
    const calls = [
      ...s.sendRealtimeInput.mock.invocationCallOrder.map((n, i) => ({
        n,
        v: `text:${(s.sendRealtimeInput.mock.calls[i]![0] as { text: string }).text}`,
      })),
      ...s.sendToolResponse.mock.invocationCallOrder.map((n) => ({ n, v: "tool:c1" })),
    ].sort((x, y) => x.n - y.n);
    const order = calls.map((x) => x.v);
    expect(order).toEqual(["text:a", "tool:c1", "text:b"]);
  });

  it("keeps at most 8 queued texts, dropping the oldest, and never drops tool responses", async () => {
    const h = makeHarness();
    const { handle } = await open({ connectFn: h.connectFn });
    h.conns[0]!.drop();
    handle.sendToolResponse("c1", { ok: true });
    for (let i = 1; i <= 10; i++) handle.sendText(`t${i}`);
    await vi.advanceTimersByTimeAsync(100);
    const s = h.conns[1]!.session;
    expect(s.sendRealtimeInput.mock.calls.map((c) => (c[0] as { text: string }).text)).toEqual([
      "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10",
    ]);
    expect(s.sendToolResponse).toHaveBeenCalledOnce();
  });

  it("drops audio and video while reconnecting instead of queueing them", async () => {
    const h = makeHarness();
    const { handle } = await open({ connectFn: h.connectFn });
    h.conns[0]!.drop();
    handle.sendAudioChunkBase64("AAA=");
    handle.sendVideoFrameJpegBase64("JPG=");
    await vi.advanceTimersByTimeAsync(100);
    expect(h.conns[0]!.session.sendRealtimeInput).not.toHaveBeenCalled();
    expect(h.conns[1]!.session.sendRealtimeInput).not.toHaveBeenCalled();
    handle.sendVideoFrameJpegBase64("JPG2=");
    expect(h.conns[1]!.session.sendRealtimeInput).toHaveBeenCalledWith({
      video: { data: "JPG2=", mimeType: "image/jpeg" },
    });
  });
});

describe("initial connect failure", () => {
  it("rejects when connectFn rejects, without retrying or calling callbacks", async () => {
    const h = makeHarness();
    h.state.failNext = 1;
    const callbacks = makeCallbacks();
    await expect(open({ connectFn: h.connectFn }, callbacks)).rejects.toThrow("connect failed");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.attempts).toHaveLength(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onReconnecting).not.toHaveBeenCalled();
  });

  it("rejects when onerror fires before the connect resolves", async () => {
    const callbacks = makeCallbacks();
    const connectFn: LiveConnectFn = (params) =>
      new Promise((_resolve) => {
        params.callbacks.onerror?.(new Error("handshake failed"));
      });
    await expect(open({ connectFn }, callbacks)).rejects.toThrow("handshake failed");
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("rejects when the socket closes before the connect resolves", async () => {
    const connectFn: LiveConnectFn = (params) =>
      new Promise((_resolve) => {
        params.callbacks.onclose?.({ code: 1006 });
      });
    await expect(open({ connectFn })).rejects.toThrow();
  });
});

describe("callback isolation", () => {
  it("keeps dispatching other callbacks when one throws", async () => {
    const h = makeHarness();
    const callbacks = makeCallbacks();
    callbacks.onAudioBase64.mockImplementation(() => {
      throw new Error("audio boom");
    });
    callbacks.onInputTranscript.mockImplementation(() => {
      throw new Error("transcript boom");
    });
    await open({ connectFn: h.connectFn }, callbacks);
    expect(() =>
      h.conns[0]!.push({
        data: "QQ==",
        serverContent: { inputTranscription: { text: "x" }, outputTranscription: { text: "y" }, turnComplete: true },
        toolCall: { functionCalls: [{ id: "c", name: "highlight", args: {} }] },
      }),
    ).not.toThrow();
    expect(callbacks.onOutputTranscript).toHaveBeenCalledWith("y");
    expect(callbacks.onToolCall).toHaveBeenCalledOnce();
    expect(callbacks.onTurnComplete).toHaveBeenCalledOnce();
  });

  it("survives throwing lifecycle callbacks during reconnect and close", async () => {
    const h = makeHarness();
    const callbacks = makeCallbacks();
    callbacks.onReconnecting.mockImplementation(() => {
      throw new Error("x");
    });
    callbacks.onReconnected.mockImplementation(() => {
      throw new Error("x");
    });
    callbacks.onClose.mockImplementation(() => {
      throw new Error("x");
    });
    const { handle } = await open({ connectFn: h.connectFn }, callbacks);
    h.conns[0]!.drop();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.conns).toHaveLength(2);
    expect(() => handle.close()).not.toThrow();
  });
});
