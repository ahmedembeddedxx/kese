import { beforeEach, describe, expect, it } from "vitest";
import { loadSettings, useSettingsStore } from "./settingsStore";

describe("settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSettingsStore.getState().reset();
  });

  it("defaults to the server's choices", () => {
    expect(loadSettings()).toEqual({ voiceProvider: "elevenlabs", voiceId: null, ttsModel: null, liveModel: null });
  });

  it("persists choices and reloads them", () => {
    useSettingsStore.getState().update({ voiceId: "abc12345", voiceProvider: "gemini" });
    expect(loadSettings()).toMatchObject({ voiceId: "abc12345", voiceProvider: "gemini" });
  });

  it("ignores garbage in storage", () => {
    window.localStorage.setItem("mend.settings.v1", '{"voiceId":42,"voiceProvider":"x","ttsModel":""}');
    expect(loadSettings()).toEqual({ voiceProvider: "elevenlabs", voiceId: null, ttsModel: null, liveModel: null });
  });

  it("survives unreadable storage", () => {
    window.localStorage.setItem("mend.settings.v1", "{not json");
    expect(loadSettings().voiceProvider).toBe("elevenlabs");
  });
});
