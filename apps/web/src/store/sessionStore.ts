// Which screen is showing, which repair the user picked and the Live
// session that came back for it. Separate from overlayStore (what is drawn
// on the camera) and chatStore (saved conversations).

import { create } from "zustand";
import type { Category, SessionResponse } from "../lib/types";
import { useChatStore } from "./chatStore";

export type Screen = "home" | "consent" | "live" | "chat";

const CONSENT_KEY = "kese.consent.v1";
const LEGACY_CONSENT_KEY = "mend.consent.v1";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the choice just doesn't persist past this load.
  }
}

interface StartOptions {
  /** Continue an existing chat instead of opening a new one. */
  chatId?: string;
  /** Title for a new chat (a guided repair's name). */
  title?: string;
}

interface SessionState {
  screen: Screen;
  category: Category | null;
  playbookId: string | null;
  consented: boolean;
  session: SessionResponse | null;
  sessionId: string | null;
  /** The chat the running live session records into. */
  activeChatId: string | null;
  /** The chat shown on the chat screen. */
  viewChatId: string | null;
  /** Chat to continue / title to give the chat created when Live starts. */
  pendingChatId: string | null;
  pendingTitle: string | null;
  /** Mobile navigation drawer. */
  drawerOpen: boolean;
  settingsOpen: boolean;

  goHome: () => void;
  /** Home -> Live, via the consent screen the first time. */
  requestStart: (category: Category, playbookId?: string, options?: StartOptions) => void;
  acceptConsent: () => void;
  declineConsent: () => void;
  setSession: (session: SessionResponse, sessionId: string) => void;
  /** Called by the live screen once it has a chat to record into. */
  beginChat: (chatId: string) => void;
  /** Live -> chat screen (or home if nothing was said). */
  finishRepair: () => void;
  openChat: (chatId: string) => void;
  continueChat: (chatId: string) => void;
  setDrawerOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  screen: "home",
  category: null,
  playbookId: null,
  consented: (readStored(CONSENT_KEY) ?? readStored(LEGACY_CONSENT_KEY)) === "1",
  session: null,
  sessionId: null,
  activeChatId: null,
  viewChatId: null,
  pendingChatId: null,
  pendingTitle: null,
  drawerOpen: false,
  settingsOpen: false,

  goHome: () => set({ screen: "home", session: null, sessionId: null, drawerOpen: false }),

  requestStart: (category, playbookId, options) =>
    set({
      category,
      playbookId: playbookId ?? null,
      pendingChatId: options?.chatId ?? null,
      pendingTitle: options?.title ?? null,
      drawerOpen: false,
      screen: get().consented ? "live" : "consent",
    }),

  acceptConsent: () => {
    writeStored(CONSENT_KEY, "1");
    set({ consented: true, screen: "live" });
  },

  declineConsent: () => set({ screen: "home" }),
  setSession: (session, sessionId) => set({ session, sessionId }),
  beginChat: (chatId) => set({ activeChatId: chatId, pendingChatId: null, pendingTitle: null }),

  finishRepair: () => {
    const id = get().activeChatId;
    const chat = id ? useChatStore.getState().chats.find((c) => c.id === id) : undefined;
    if (!id || !chat) {
      set({ screen: "home", activeChatId: null });
      return;
    }
    // A chat where nothing was said is noise in the history: drop it.
    if (chat.messages.length === 0) {
      useChatStore.getState().deleteChat(id);
      set({ screen: "home", activeChatId: null });
      return;
    }
    set({ screen: "chat", viewChatId: id, activeChatId: null });
  },

  openChat: (chatId) => set({ screen: "chat", viewChatId: chatId, drawerOpen: false }),

  continueChat: (chatId) => {
    const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!chat) return;
    get().requestStart(chat.category, chat.playbookId ?? undefined, { chatId });
  },

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen, drawerOpen: false }),
}));
