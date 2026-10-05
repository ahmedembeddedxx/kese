// The user's voice and model choices, remembered on this device. `null`
// means "use the server default", so a fresh install always works and a
// later change of the default reaches everyone who never picked one.

import { create } from "zustand";
import type { VoiceProvider } from "../lib/types";

const KEY = "kese.settings.v1";
const LEGACY_KEY = "mend.settings.v1";

export interface Settings {
  voiceProvider: VoiceProvider;
  voiceId: string | null;
  ttsModel: string | null;
  liveModel: string | null;
}

const DEFAULTS: Settings = {
  voiceProvider: "elevenlabs",
  voiceId: null,
  ttsModel: null,
  liveModel: null,
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 80 ? value : null;
}

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    return {
      voiceProvider: parsed.voiceProvider === "gemini" ? "gemini" : "elevenlabs",
      voiceId: str(parsed.voiceId),
      ttsModel: str(parsed.ttsModel),
      liveModel: str(parsed.liveModel),
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(settings: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: choices last for this page load only.
  }
}

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  update: (patch) => {
    set(patch);
    const { voiceProvider, voiceId, ttsModel, liveModel } = get();
    persist({ voiceProvider, voiceId, ttsModel, liveModel });
  },
  reset: () => {
    set(DEFAULTS);
    persist(DEFAULTS);
  },
}));
