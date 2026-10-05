// Deterministic fake "agent" for design review, screenshots and demos
// without API keys (VITE_MOCK_LIVE=1). Drives the same stores the real
// session does, so every visual state of the live screen can be reached:
//   ?mock=listening | thinking | speaking | gate | reconnecting
// With no `mock` param it plays a short scripted conversation.
// This file is never imported in the real flow's logic paths; it only
// runs when the build-time flag is set.

import type { MutableRefObject } from "react";
import { useLiveStore, type Phase } from "../../store/liveStore";
import { useOverlayStore } from "../../store/overlayStore";

const PHASES: Phase[] = ["listening", "thinking", "speaking", "reconnecting"];

export function runMockLive(levelRef: MutableRefObject<number>): () => void {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mock");
  const live = useLiveStore.getState();
  const overlay = useOverlayStore.getState();
  const timers: number[] = [];
  let tick = 0;

  live.setVoice("elevenlabs", false);
  live.setPlaybook({
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
  });
  overlay.setStepProgress(2, 5);
  overlay.setCaption("Switch off the fan at the wall.", "پنکھے کو دیوار پر سوئچ سے بند کریں۔");
  overlay.setBoxes([
    { id: "a", label: "capacitor", box: { ymin: 300, xmin: 380, ymax: 520, xmax: 620 }, polygon: null, confidence: 0.92 },
    { id: "b", label: "wires", box: { ymin: 560, xmin: 400, ymax: 700, xmax: 600 }, polygon: null, confidence: 0.88 },
  ]);

  const apply = (phase: Phase) => {
    live.setPhase(phase);
    if (phase === "speaking") {
      live.setUserCaption("یہ پنکھا گھوم نہیں رہا");
      live.setAgentCaption("سب سے پہلے پنکھے کو دیوار کے سوئچ سے بند کریں۔");
    } else if (phase === "listening") {
      live.setUserCaption("");
      live.setAgentCaption("");
    } else if (phase === "thinking") {
      live.setUserCaption("یہ پنکھا گھوم نہیں رہا");
    }
  };

  if (mode === "gate") {
    apply("speaking");
    overlay.openGate({
      checkId: "power_off_confirmed",
      promptEn: "Switch off the breaker for this fan.",
      promptUr: "اس پنکھے کا بریکر بند کر دیں۔",
      confirmLabelEn: "Power is off",
      confirmLabelUr: "بجلی بند ہے",
    });
  } else if (mode && PHASES.includes(mode as Phase)) {
    apply(mode as Phase);
  } else {
    apply("listening");
    let step = 0;
    const order: Phase[] = ["listening", "thinking", "speaking"];
    timers.push(
      window.setInterval(() => {
        step = (step + 1) % order.length;
        apply(order[step]);
      }, 4000),
    );
  }

  // A moving level so the orb animates without audio.
  timers.push(
    window.setInterval(() => {
      tick += 1;
      const p = useLiveStore.getState().phase;
      const base = p === "speaking" || p === "listening" ? 0.35 : 0.05;
      levelRef.current = Math.max(0, base + 0.3 * Math.sin(tick / 3) * (p === "thinking" ? 0 : 1));
    }, 60),
  );

  return () => {
    for (const id of timers) window.clearInterval(id);
  };
}
