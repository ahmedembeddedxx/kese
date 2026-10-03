// Which repair the user picked and the Live session that came back for
// it. Separate from overlayStore (what's currently drawn on screen) so
// switching categories doesn't need to touch overlay state directly.

import { create } from "zustand";
import type { Category, SessionResponse } from "../lib/types";

export type Screen = "home" | "live" | "done";

interface SessionState {
  screen: Screen;
  category: Category | null;
  playbookId: string | null;
  language: "en" | "ur";
  session: SessionResponse | null;
  sessionId: string | null;

  goHome: () => void;
  startRepair: (category: Category, playbookId?: string) => void;
  setLanguage: (language: "en" | "ur") => void;
  setSession: (session: SessionResponse, sessionId: string) => void;
  finishRepair: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  screen: "home",
  category: null,
  playbookId: null,
  language: "en",
  session: null,
  sessionId: null,

  goHome: () => set({ screen: "home", session: null, sessionId: null }),
  startRepair: (category, playbookId) =>
    set({ screen: "live", category, playbookId: playbookId ?? null }),
  setLanguage: (language) => set({ language }),
  setSession: (session, sessionId) => set({ session, sessionId }),
  finishRepair: () => set({ screen: "done" }),
}));
