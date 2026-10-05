// The signature element: a pill of five bars that is the "face" of the
// voice agent. It reads loudness through a ref polled on every animation
// frame, so a 60 fps animation never re-renders React.
//   listening     bars follow YOUR voice (amber)
//   speaking      bars follow the agent's voice (white)
//   thinking      a slow travelling wave (no audio involved)
//   reconnecting  dim, flat
// With "reduce motion" the idle wave stops, but level-driven movement stays:
// that is information, not decoration.

import { type MutableRefObject, useEffect, useRef } from "react";
import type { Phase } from "../store/liveStore";

const BARS = 5;
const WEIGHTS = [0.55, 0.85, 1, 0.85, 0.55];

interface VoicePillProps {
  phase: Phase;
  levelRef: MutableRefObject<number>;
  muted: boolean;
  label: string;
}

export function VoicePill({ phase, levelRef, muted, label }: VoicePillProps) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const phaseRef = useRef(phase);
  const mutedRef = useRef(muted);

  useEffect(() => {
    phaseRef.current = phase;
    mutedRef.current = muted;
  }, [phase, muted]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const p = phaseRef.current;
      const level = mutedRef.current && p === "listening" ? 0 : levelRef.current;
      for (let i = 0; i < BARS; i++) {
        let h: number;
        if (p === "thinking") {
          h = reduceMotion ? 0.3 : 0.28 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3 - i * 0.9));
        } else if (p === "connecting" || p === "reconnecting" || p === "error") {
          h = 0.16;
        } else {
          const wobble = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 9 + i * 1.7);
          h = 0.16 + Math.min(1, level) * 0.84 * WEIGHTS[i] * wobble;
        }
        const el = barRefs.current[i];
        if (el) el.style.transform = `scaleY(${Math.max(0.16, Math.min(1, h)).toFixed(3)})`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  const dim = phase === "connecting" || phase === "reconnecting" || phase === "error";
  const barColor =
    phase === "speaking" ? "bg-white" : dim || muted ? "bg-white/45" : "bg-live";

  return (
    <div
      role="status"
      aria-label={label}
      data-testid="voice-pill"
      data-phase={phase}
      className="glass flex h-12 min-w-16 flex-1 items-center justify-center gap-[5px] rounded-full px-5"
    >
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className={`h-8 w-[6px] origin-center rounded-full transition-colors duration-300 ${barColor}`}
          style={{ transform: "scaleY(0.16)" }}
        />
      ))}
    </div>
  );
}
