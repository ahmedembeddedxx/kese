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
import { SCENE_BOXES, SCENE_WIRES } from "./mockScene";

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
    live.setUserCaption("The fan is not spinning.");
    live.setAgentCaption("First, switch the fan off at the wall switch.");
    overlay.openGate({
      checkId: "power_off_confirmed",
      promptEn: "Switch off the breaker for this fan.",
      promptUr: "Switch off the breaker for this fan.",
      confirmLabelEn: "Power is off",
      confirmLabelUr: "Power is off",
    });
    return;
  }
  live.setPhase(mode);
  if (mode === "speaking") {
    live.setUserCaption("The fan is not spinning.");
    live.setAgentCaption("First, switch the fan off at the wall switch.");
  } else if (mode === "thinking") {
    live.setUserCaption("The fan is not spinning.");
    live.setAgentCaption("");
  } else {
    live.setUserCaption("");
    live.setAgentCaption("");
  }
}

let wireTimers: number[] = [];

function cancelWireTimers(): void {
  for (const id of wireTimers) window.clearTimeout(id);
  wireTimers = [];
}

/** Demo bar toggle: boxes and wires are only meaningful over the drawn
 * scene. Wires are added one by one so the draw-in animation plays. */
export function setMockBoxes(on: boolean): void {
  cancelWireTimers();
  useOverlayStore.setState({ wires: [] });
  useOverlayStore.getState().setBoxes(on ? SCENE_BOXES : []);
  if (!on) return;
  SCENE_WIRES.forEach((wire, i) => {
    wireTimers.push(window.setTimeout(() => useOverlayStore.getState().addWire(wire), 400 * (i + 1)));
  });
}

const TAU = Math.PI * 2;

/** Smooth handheld-camera motion in scene units: two slow sines per axis. */
function handheldDrift(seconds: number): { x: number; y: number } {
  return {
    x: 9 * Math.sin((TAU * seconds) / 4.3) + 5 * Math.sin((TAU * seconds) / 6.7 + 1.3),
    y: 6 * Math.sin((TAU * seconds) / 5.1 + 0.7) + 4 * Math.sin((TAU * seconds) / 6.1 + 2.1),
  };
}

export function runMockLive(
  levelRef: MutableRefObject<number>,
  options: { showBoxes: boolean; driftRef?: MutableRefObject<{ x: number; y: number }> } = { showBoxes: true },
): () => void {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mock");
  const live = useLiveStore.getState();
  const overlay = useOverlayStore.getState();
  const timers: number[] = [];
  let tick = 0;

  live.setVoice("elevenlabs", false);
  live.setPlaybook(DEMO_PLAYBOOK);
  overlay.setStepProgress(2, 5);
  overlay.setCaption("Switch off the fan at the wall.", "Switch off the fan at the wall.");
  setMockBoxes(options.showBoxes);

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
      live.setUserCaption(phase === "listening" ? "" : "The fan is not spinning.");
      live.setAgentCaption(phase === "speaking" ? "First, switch the fan off at the wall switch." : "");
    }, 4000);
  }

  const driftRef = options.driftRef;
  if (driftRef && options.showBoxes) {
    const started = performance.now();
    timers.push(
      window.setInterval(() => {
        driftRef.current = handheldDrift((performance.now() - started) / 1000);
      }, 33),
    );
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
    cancelWireTimers();
    useOverlayStore.getState().clearHighlights();
    if (driftRef) driftRef.current = { x: 0, y: 0 };
  };
}
