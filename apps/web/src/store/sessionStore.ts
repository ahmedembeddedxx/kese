// Which repair the user picked and the Live session that came back for
// it. Separate from overlayStore (what's currently drawn on screen) so
// switching categories doesn't need to touch overlay state directly.

import { create } from "zustand";
import type { Language } from "../i18n/strings";
import type { Category, SessionResponse } from "../lib/types";

export type Screen = "home" | "consent" | "live" | "done";

const LANGUAGE_KEY = "mend.language";
const CONSENT_KEY = "mend.consent.v1";

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

/** Urdu is the product's primary language; English is opt-in. */
export function initialLanguage(): Language {
  return readStored(LANGUAGE_KEY) === "en" ? "en" : "ur";
}

export interface PendingStart {
  category: Category;
  playbookId: string | null;
}

interface SessionState {
  screen: Screen;
  category: Category | null;
  playbookId: string | null;
  language: Language;
  consented: boolean;
  session: SessionResponse | null;
  sessionId: string | null;
  /** Set when a repair finished normally, so Done can offer "save device". */
  finishedKind: string | null;

  goHome: () => void;
  /** Home -> Live, via the consent screen the first time. */
  requestStart: (category: Category, playbookId?: string) => void;
  acceptConsent: () => void;
  declineConsent: () => void;
  setLanguage: (language: Language) => void;
  setSession: (session: SessionResponse, sessionId: string) => void;
  finishRepair: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  screen: "home",
  category: null,
  playbookId: null,
  language: initialLanguage(),
  consented: readStored(CONSENT_KEY) === "1",
  session: null,
  sessionId: null,
  finishedKind: null,

  goHome: () => set({ screen: "home", session: null, sessionId: null }),
  requestStart: (category, playbookId) =>
    set({
      category,
      playbookId: playbookId ?? null,
      screen: get().consented ? "live" : "consent",
    }),
  acceptConsent: () => {
    writeStored(CONSENT_KEY, "1");
    set({ consented: true, screen: "live" });
  },
  declineConsent: () => set({ screen: "home" }),
  setLanguage: (language) => {
    writeStored(LANGUAGE_KEY, language);
    set({ language });
  },
  setSession: (session, sessionId) => set({ session, sessionId }),
  finishRepair: () => set({ screen: "done", finishedKind: get().category }),
}));
