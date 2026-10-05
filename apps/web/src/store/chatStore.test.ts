import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatRecorder, recapForAgent } from "../features/live/chatRecorder";
import { loadChats, MAX_MESSAGES, titleFromText, useChatStore } from "./chatStore";

function reset() {
  window.localStorage.clear();
  useChatStore.setState({ chats: [] });
}

describe("chatStore", () => {
  beforeEach(reset);
  afterEach(() => vi.useRealTimers());

  it("creates a chat, titles it from the first user message and persists it", () => {
    const id = useChatStore.getState().createChat({ category: "electrical", playbookId: null });
    expect(useChatStore.getState().chats[0].title).toBe("Electrical");
    useChatStore.getState().addMessage(id, "user", "The ceiling fan is humming but not turning");
    useChatStore.getState().addMessage(id, "user", "second message does not retitle");
    const chat = useChatStore.getState().chats[0];
    expect(chat.title).toBe("The ceiling fan is humming but not turning");
    expect(chat.messages).toHaveLength(2);
    expect(loadChats()[0].messages).toHaveLength(2);
  });

  it("keeps an explicit title", () => {
    const id = useChatStore.getState().createChat({ category: "ac", playbookId: "ac-filter-clean", title: "Clean the AC filter" });
    useChatStore.getState().addMessage(id, "user", "hello");
    expect(useChatStore.getState().chats[0].title).toBe("Clean the AC filter");
  });

  it("orders chats by most recent activity", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      const a = useChatStore.getState().createChat({ category: "car", playbookId: null });
      vi.setSystemTime(2_000);
      const b = useChatStore.getState().createChat({ category: "ac", playbookId: null });
      expect(useChatStore.getState().chats.map((c) => c.id)).toEqual([b, a]);
      vi.setSystemTime(3_000);
      useChatStore.getState().addMessage(a, "user", "later");
      expect(useChatStore.getState().chats.map((c) => c.id)).toEqual([a, b]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores blank messages and renames and deletes", () => {
    const id = useChatStore.getState().createChat({ category: "general", playbookId: null });
    useChatStore.getState().addMessage(id, "agent", "   ");
    expect(useChatStore.getState().chats[0].messages).toHaveLength(0);
    useChatStore.getState().renameChat(id, "  My fan  ");
    expect(useChatStore.getState().chats[0].title).toBe("My fan");
    useChatStore.getState().deleteChat(id);
    expect(useChatStore.getState().chats).toHaveLength(0);
    expect(loadChats()).toHaveLength(0);
  });

  it("caps messages per chat", () => {
    const id = useChatStore.getState().createChat({ category: "general", playbookId: null });
    for (let i = 0; i < MAX_MESSAGES + 20; i++) useChatStore.getState().addMessage(id, "user", `m${i}`);
    const messages = useChatStore.getState().chats[0].messages;
    expect(messages).toHaveLength(MAX_MESSAGES);
    expect(messages[messages.length - 1].text).toBe(`m${MAX_MESSAGES + 19}`);
  });

  it("survives corrupt or hostile storage", () => {
    window.localStorage.setItem("kese.chats.v1", "{nope");
    expect(loadChats()).toEqual([]);
    window.localStorage.setItem(
      "kese.chats.v1",
      JSON.stringify([{ id: 7 }, { id: "x", title: "ok", category: "bogus", messages: [{ role: "root", text: "x" }, { role: "user", text: "hi" }] }]),
    );
    const chats = loadChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].category).toBe("general");
    expect(chats[0].messages).toHaveLength(1);
  });

  it("truncates long titles", () => {
    expect(titleFromText("a".repeat(100))).toHaveLength(42);
  });
});

describe("ChatRecorder", () => {
  beforeEach(reset);

  function setup() {
    const id = useChatStore.getState().createChat({ category: "general", playbookId: null });
    return { id, rec: new ChatRecorder(() => id), messages: () => useChatStore.getState().chats[0].messages };
  }

  it("stores a streamed agent reply as one message", () => {
    const { rec, messages } = setup();
    rec.appendAgent("First, switch ");
    rec.appendAgent("the fan off.");
    expect(messages()).toHaveLength(0);
    rec.finishAgent();
    expect(messages().map((m) => m.text)).toEqual(["First, switch the fan off."]);
  });

  it("puts the user turn before the reply that follows it (audio path)", () => {
    const { rec, messages } = setup();
    rec.appendUser("It is ");
    rec.appendUser("humming");
    rec.appendAgent("Let me look.");
    rec.finishAgent();
    expect(messages().map((m) => [m.role, m.text])).toEqual([
      ["user", "It is humming"],
      ["agent", "Let me look."],
    ]);
  });

  it("closes an interrupted agent reply when the user speaks", () => {
    const { rec, messages } = setup();
    rec.appendAgent("Hold on, first you");
    rec.pushUser("wait, which switch?");
    expect(messages().map((m) => m.role)).toEqual(["agent", "user"]);
  });

  it("creates the chat only when something is saved", () => {
    const resolve = vi.fn(() => useChatStore.getState().createChat({ category: "general", playbookId: null }));
    const rec = new ChatRecorder(resolve);
    rec.appendAgent("   ");
    rec.close();
    expect(resolve).not.toHaveBeenCalled();
    expect(useChatStore.getState().chats).toHaveLength(0);
    rec.pushUser("hello");
    rec.pushUser("again");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().chats[0].messages).toHaveLength(2);
  });

  it("records events and flushes on close", () => {
    const { rec, messages } = setup();
    rec.event("Step 2: switch off at the wall");
    rec.appendAgent("Done");
    rec.close();
    expect(messages().map((m) => m.role)).toEqual(["event", "agent"]);
  });
});

describe("recapForAgent", () => {
  it("returns null with nothing said and summarises the tail otherwise", () => {
    expect(recapForAgent([{ role: "event", text: "Step 1" }])).toBeNull();
    const recap = recapForAgent(Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "agent" : "user", text: `line ${i}` })));
    expect(recap).toContain("Do not reply");
    expect(recap).toContain("line 11");
    expect(recap).not.toContain("line 3");
  });
});
