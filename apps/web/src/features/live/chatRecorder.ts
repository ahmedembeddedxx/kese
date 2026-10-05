// Turns the stream of live events (streamed text deltas, whole committed
// transcripts, tool events) into clean chat messages. Pure logic over the
// chat store, so it is unit tested without any media or sockets.
//
// Rules that keep the transcript readable:
//  - a user turn is flushed BEFORE the agent's reply that follows it
//  - an agent reply in progress is closed when the user barges in
//  - nothing is stored for blank text

import { useChatStore } from "../../store/chatStore";

export class ChatRecorder {
  private userBuffer = "";
  private agentBuffer = "";

  private readonly resolveChatId: () => string;
  private chatId: string | null = null;

  /** `resolveChatId` runs once, on the first thing worth saving, so a session
   * where nothing is said never leaves an empty chat behind. */
  constructor(resolveChatId: () => string) {
    this.resolveChatId = resolveChatId;
  }

  private write(role: "user" | "agent" | "event", text: string): void {
    if (!text.trim()) return;
    this.chatId ??= this.resolveChatId();
    useChatStore.getState().addMessage(this.chatId, role, text);
  }

  /** A complete user utterance (ElevenLabs path). */
  pushUser(text: string): void {
    this.finishAgent();
    this.flushUser();
    this.write("user", text);
  }

  /** A streamed piece of the user's speech (Gemini audio path). */
  appendUser(delta: string): void {
    this.finishAgent();
    this.userBuffer += delta;
  }

  /** A streamed piece of the agent's reply. */
  appendAgent(delta: string): void {
    this.flushUser();
    this.agentBuffer += delta;
  }

  /** The agent finished (or was interrupted): store what it said so far. */
  finishAgent(): void {
    const text = this.agentBuffer;
    this.agentBuffer = "";
    this.write("agent", text);
  }

  /** Something that happened, not something said (a step, a safety check). */
  event(text: string): void {
    this.finishAgent();
    this.flushUser();
    this.write("event", text);
  }

  /** Session ended: keep whatever is still buffered. */
  close(): void {
    this.flushUser();
    this.finishAgent();
  }

  private flushUser(): void {
    const text = this.userBuffer;
    this.userBuffer = "";
    if (text.trim()) this.write("user", text);
  }
}

/** A short recap of an earlier chat, for the agent when a chat is continued. */
export function recapForAgent(
  messages: { role: string; text: string }[],
  limit = 8,
): string | null {
  const spoken = messages.filter((m) => m.role === "user" || m.role === "agent").slice(-limit);
  if (spoken.length === 0) return null;
  const lines = spoken.map((m) => `${m.role === "user" ? "User" : "You"}: ${m.text.slice(0, 160)}`);
  return `[Earlier in this chat, for context only. Do not reply to this message.]\n${lines.join("\n")}`;
}
