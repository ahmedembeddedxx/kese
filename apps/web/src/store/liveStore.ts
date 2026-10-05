// Transient UI state of the live screen: what the voice agent is doing
// right now, captions, and camera/mic toggles. Kept apart from
// overlayStore (what is drawn on the camera) and sessionStore (which
// repair is running). The microphone/voice LEVEL is deliberately not in
// here: it changes ~60 times a second, so the pill reads it through a ref
// polled with requestAnimationFrame instead of re-rendering React.

import { create } from "zustand";
import type { PlaybookDetail, VoiceProvider } from "../lib/types";

export type Phase =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "error";

export type CameraSource = "environment" | "user" | "screen";

export interface LiveError {
  kind: "camera" | "mic" | "consent" | "option" | "busy" | "generic";
}

interface LiveState {
  phase: Phase;
  userCaption: string;
  agentCaption: string;
  micMuted: boolean;
  cameraSource: CameraSource;
  torchOn: boolean;
  torchSupported: boolean;
  canFlip: boolean;
  canShareScreen: boolean;
  voiceProvider: VoiceProvider | null;
  usingFallbackVoice: boolean;
  error: LiveError | null;
  playbook: PlaybookDetail | null;
  /** Demo build only: the user's real camera is showing instead of the drawn scene. */
  demoRealCamera: boolean;

  reset: () => void;
  setPhase: (phase: Phase) => void;
  setUserCaption: (text: string) => void;
  appendUserCaption: (delta: string) => void;
  setAgentCaption: (text: string) => void;
  appendAgentCaption: (delta: string) => void;
  setMicMuted: (muted: boolean) => void;
  setCameraState: (patch: Partial<Pick<LiveState, "cameraSource" | "torchOn" | "torchSupported" | "canFlip" | "canShareScreen">>) => void;
  setVoice: (provider: VoiceProvider, fallback: boolean) => void;
  fail: (error: LiveError) => void;
  setPlaybook: (playbook: PlaybookDetail | null) => void;
  setDemoRealCamera: (on: boolean) => void;
}

const initial = {
  phase: "connecting" as Phase,
  userCaption: "",
  agentCaption: "",
  micMuted: false,
  cameraSource: "environment" as CameraSource,
  torchOn: false,
  torchSupported: false,
  canFlip: false,
  canShareScreen: false,
  voiceProvider: null as VoiceProvider | null,
  usingFallbackVoice: false,
  error: null as LiveError | null,
  playbook: null as PlaybookDetail | null,
  demoRealCamera: false,
};

export const useLiveStore = create<LiveState>((set) => ({
  ...initial,
  reset: () => set({ ...initial }),
  setPhase: (phase) => set({ phase }),
  setUserCaption: (userCaption) => set({ userCaption }),
  appendUserCaption: (delta) => set((s) => ({ userCaption: s.userCaption + delta })),
  setAgentCaption: (agentCaption) => set({ agentCaption }),
  appendAgentCaption: (delta) => set((s) => ({ agentCaption: s.agentCaption + delta })),
  setMicMuted: (micMuted) => set({ micMuted }),
  setCameraState: (patch) => set(patch),
  setVoice: (voiceProvider, usingFallbackVoice) => set({ voiceProvider, usingFallbackVoice }),
  fail: (error) => set({ error, phase: "error" }),
  setPlaybook: (playbook) => set({ playbook }),
  setDemoRealCamera: (demoRealCamera) => set({ demoRealCamera }),
}));
