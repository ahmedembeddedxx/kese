// Saved chats, kept in this browser's localStorage for now (no account,
// nothing leaves the device). One chat = one conversation with the agent:
// its transcript plus a little metadata. A chat can be reopened, read, and
// continued in a new live session.
//
// Limits keep the data well under the ~5 MB localStorage quota: 100 chats,
// 300 messages each, 2000 characters per message. Oldest chats are dropped
// first. Everything read back from storage is validated, because the
// storage is user-editable and may come from an older version.

import { create } from "zustand";
import type { Category } from "../lib/types";

const KEY = "kese.chats.v1";
export const MAX_CHATS = 100;
export const MAX_MESSAGES = 300;
export const MAX_TEXT = 2000;

export type MessageRole = "user" | "agent" | "event";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  at: number;
}

export interface Chat {
  id: string;
  title: string;
  /** True until the user renames it or a title is derived from the first message. */
  autoTitle: boolean;
  category: Category;
  playbookId: string | null;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  feedback: "up" | "down" | null;
  deviceSaved: boolean;
}

const CATEGORIES: Category[] = ["electrical", "ac", "car", "general"];

function newId(): string {
  return crypto.randomUUID();
}

export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 41).trimEnd()}…` : clean;
}

function sanitizeMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.role !== "user" && m.role !== "agent" && m.role !== "event") return null;
  if (typeof m.text !== "string" || m.text.length === 0) return null;
  return {
    id: typeof m.id === "string" ? m.id : newId(),
    role: m.role,
    text: m.text.slice(0, MAX_TEXT),
    at: typeof m.at === "number" ? m.at : Date.now(),
  };
}

function sanitizeChat(raw: unknown): Chat | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || typeof c.title !== "string") return null;
  const category = CATEGORIES.includes(c.category as Category) ? (c.category as Category) : "general";
  const messages = Array.isArray(c.messages)
    ? c.messages.map(sanitizeMessage).filter((m): m is ChatMessage => m !== null).slice(-MAX_MESSAGES)
    : [];
  const createdAt = typeof c.createdAt === "number" ? c.createdAt : Date.now();
  return {
    id: c.id,
    title: c.title.slice(0, 80) || "Chat",
    autoTitle: c.autoTitle === true,
    category,
    playbookId: typeof c.playbookId === "string" ? c.playbookId : null,
    createdAt,
    updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : createdAt,
    messages,
    feedback: c.feedback === "up" || c.feedback === "down" ? c.feedback : null,
    deviceSaved: c.deviceSaved === true,
  };
}

export function loadChats(): Chat[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeChat)
      .filter((c): c is Chat => c !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CHATS);
  } catch {
    return [];
  }
}

function persist(chats: Chat[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(chats));
  } catch {
    // Quota exceeded or storage blocked: try once more with the newest half
    // so recent conversations are never lost to a full disk.
    try {
      window.localStorage.setItem(KEY, JSON.stringify(chats.slice(0, Math.ceil(chats.length / 2))));
    } catch {
      // Give up quietly; the in-memory list still works for this page load.
    }
  }
}

interface ChatState {
  chats: Chat[];
  createChat: (args: { category: Category; playbookId: string | null; title?: string }) => string;
  addMessage: (chatId: string, role: MessageRole, text: string) => void;
  renameChat: (chatId: string, title: string) => void;
  deleteChat: (chatId: string) => void;
  setFeedback: (chatId: string, feedback: "up" | "down") => void;
  markDeviceSaved: (chatId: string) => void;
  clearAll: () => void;
}

const CATEGORY_TITLE: Record<Category, string> = {
  electrical: "Electrical",
  ac: "AC",
  car: "Car",
  general: "New chat",
};

export const useChatStore = create<ChatState>((set, get) => {
  function update(chatId: string, fn: (chat: Chat) => Chat): void {
    const chats = get().chats.map((c) => (c.id === chatId ? fn(c) : c));
    chats.sort((a, b) => b.updatedAt - a.updatedAt);
    persist(chats);
    set({ chats });
  }

  return {
    chats: loadChats(),

    createChat: ({ category, playbookId, title }) => {
      const now = Date.now();
      const chat: Chat = {
        id: newId(),
        title: title?.slice(0, 80) || CATEGORY_TITLE[category],
        autoTitle: !title,
        category,
        playbookId,
        createdAt: now,
        updatedAt: now,
        messages: [],
        feedback: null,
        deviceSaved: false,
      };
      const chats = [chat, ...get().chats].slice(0, MAX_CHATS);
      persist(chats);
      set({ chats });
      return chat.id;
    },

    addMessage: (chatId, role, text) => {
      const clean = text.trim().slice(0, MAX_TEXT);
      if (!clean) return;
      update(chatId, (chat) => {
        const message: ChatMessage = { id: newId(), role, text: clean, at: Date.now() };
        const messages = [...chat.messages, message].slice(-MAX_MESSAGES);
        const retitle = chat.autoTitle && role === "user";
        return {
          ...chat,
          messages,
          updatedAt: message.at,
          title: retitle ? titleFromText(clean) : chat.title,
          autoTitle: retitle ? false : chat.autoTitle,
        };
      });
    },

    renameChat: (chatId, title) => {
      const clean = title.trim().slice(0, 80);
      if (!clean) return;
      update(chatId, (chat) => ({ ...chat, title: clean, autoTitle: false }));
    },

    deleteChat: (chatId) => {
      const chats = get().chats.filter((c) => c.id !== chatId);
      persist(chats);
      set({ chats });
    },

    setFeedback: (chatId, feedback) => update(chatId, (chat) => ({ ...chat, feedback })),

    markDeviceSaved: (chatId) => update(chatId, (chat) => ({ ...chat, deviceSaved: true })),

    clearAll: () => {
      persist([]);
      set({ chats: [] });
    },
  };
});
