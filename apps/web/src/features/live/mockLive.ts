// Deterministic fake "agent" for design review, screenshots and demos
// without API keys (VITE_MOCK_LIVE=1). Drives the same stores the real
// session does, so every visual state of the live screen can be reached:
//   ?mock=listening | thinking | speaking | gate | reconnecting
// Without a `mock` param it cycles listening, thinking, speaking, and the
// on-screen demo bar (MockDemoBar) can jump to any state.
// This file is never imported in the real flow's logic paths; it only
// runs when the build-time flag is set.

import type { MutableRefObject } from "react";
import type { PlaybookDetail } from "../../lib/types";
import { useLiveStore } from "../../store/liveStore";
import { useOverlayStore } from "../../store/overlayStore";

const DEMO_PLAYBOOK: PlaybookDetail = {
  id: "fan-capacitor-replace",
  category: "electrical",
  title: "Replace a fan capacitor",
  title_ur: "پنکھے کا کیپیسیٹر بدلیں",
  risk: "high",
  summary: "",
  summary_ur: "",
  tools: [],
  tools_ur: [],
  stop_if: [],
  stop_if_ur: [],
  steps: [
    ["s1", "Turn off the breaker", "بریکر بند کریں"],
    ["s2", "Switch off the fan at the wall", "پنکھے کو دیوار پر سوئچ سے بند کریں"],
    ["s3", "Open the fan housing", "پنکھے کا ڈھکن کھولیں"],
    ["s4", "Photograph the wiring", "تاروں کی تصویر لیں"],
    ["s5", "Replace the capacitor", "کیپیسیٹر بدلیں"],
  ].map(([id, say, say_ur]) => ({
    id,
    say,
    say_ur,
    gate: null,
    highlight: [],
    read_text: false,
    mark_wires: false,
  })),
};


export type MockMode = "listening" | "thinking" | "speaking" | "reconnecting" | "gate";

let autoCycle: number | null = null;

function stopCycle(): void {
  if (autoCycle !== null) window.clearInterval(autoCycle);
  autoCycle = null;
}

export function applyMockMode(mode: MockMode): void {
  stopCycle();
  const live = useLiveStore.getState();
  const overlay = useOverlayStore.getState();
  overlay.confirmGate();
  if (mode === "gate") {
    live.setPhase("speaking");
    live.setUserCaption("یہ پنکھا گھوم نہیں رہا");
    live.setAgentCaption("سب سے پہلے پنکھے کو دیوار کے سوئچ سے بند کریں۔");
    overlay.openGate({
      checkId: "power_off_confirmed",
      promptEn: "Switch off the breaker for this fan.",
      promptUr: "اس پنکھے کا بریکر بند کر دیں۔",
      confirmLabelEn: "Power is off",
      confirmLabelUr: "بجلی بند ہے",
    });
    return;
  }
  live.setPhase(mode);
  if (mode === "speaking") {
    live.setUserCaption("یہ پنکھا گھوم نہیں رہا");
    live.setAgentCaption("سب سے پہلے پنکھے کو دیوار کے سوئچ سے بند کریں۔");
  } else if (mode === "thinking") {
    live.setUserCaption("یہ پنکھا گھوم نہیں رہا");
    live.setAgentCaption("");
  } else {
    live.setUserCaption("");
    live.setAgentCaption("");
  }
}

export function runMockLive(levelRef: MutableRefObject<number>): () => void {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mock");
  const live = useLiveStore.getState();
  const overlay = useOverlayStore.getState();
  const timers: number[] = [];
  let tick = 0;

  live.setVoice("elevenlabs", false);
  live.setPlaybook(DEMO_PLAYBOOK);
  overlay.setStepProgress(2, 5);
  overlay.setCaption("Switch off the fan at the wall.", "پنکھے کو دیوار پر سوئچ سے بند کریں۔");
  overlay.setBoxes([
    { id: "a", label: "capacitor", box: { ymin: 470, xmin: 290, ymax: 590, xmax: 710 }, polygon: null, confidence: 0.92 },
    { id: "b", label: "wires", box: { ymin: 610, xmin: 380, ymax: 780, xmax: 650 }, polygon: null, confidence: 0.88 },
  ]);

  const known: MockMode[] = ["listening", "thinking", "speaking", "reconnecting", "gate"];
  if (mode && known.includes(mode as MockMode)) {
    applyMockMode(mode as MockMode);
  } else {
    applyMockMode("listening");
    let step = 0;
    const order = ["listening", "thinking", "speaking"] as const;
    autoCycle = window.setInterval(() => {
      step = (step + 1) % order.length;
      const phase = order[step];
      live.setPhase(phase);
      live.setUserCaption(phase === "listening" ? "" : "یہ پنکھا گھوم نہیں رہا");
      live.setAgentCaption(phase === "speaking" ? "سب سے پہلے پنکھے کو دیوار کے سوئچ سے بند کریں۔" : "");
    }, 4000);
  }

  // A moving level so the pill animates without any audio.
  timers.push(
    window.setInterval(() => {
      tick += 1;
      const p = useLiveStore.getState().phase;
      const base = p === "speaking" || p === "listening" ? 0.35 : 0.05;
      levelRef.current = Math.max(0, base + 0.3 * Math.sin(tick / 3) * (p === "thinking" ? 0 : 1));
    }, 60),
  );

  return () => {
    stopCycle();
    for (const id of timers) window.clearInterval(id);
  };
}
