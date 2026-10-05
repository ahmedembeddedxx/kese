// Demo-only chips for jumping the live screen to any state while reviewing
// the design (VITE_MOCK_LIVE=1). Not rendered in real builds.

import { useState } from "react";
import { applyMockMode, type MockMode, setMockBoxes } from "../features/live/mockLive";
import { useOverlayStore } from "../store/overlayStore";

const MODES: { id: MockMode; label: string }[] = [
  { id: "listening", label: "Listening" },
  { id: "thinking", label: "Thinking" },
  { id: "speaking", label: "Speaking" },
  { id: "gate", label: "Safety gate" },
  { id: "reconnecting", label: "Reconnecting" },
];

export function MockDemoBar() {
  const [active, setActive] = useState<MockMode | null>(null);
  const boxesOn = useOverlayStore((s) => s.boxes.length > 0);
  return (
    <div
      dir="ltr"
      className="absolute inset-x-0 top-[calc(4.25rem+var(--safe-top))] z-20 flex flex-wrap justify-center gap-1.5 px-3"
      data-testid="mock-demo-bar"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => {
            setActive(m.id);
            applyMockMode(m.id);
          }}
          aria-pressed={active === m.id}
          className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${
            active === m.id ? "bg-white text-black" : "bg-black/55 text-white ring-1 ring-white/25"
          }`}
        >
          {m.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setMockBoxes(!boxesOn)}
        aria-pressed={boxesOn}
        className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${
          boxesOn ? "bg-white text-black" : "bg-black/55 text-white ring-1 ring-white/25"
        }`}
      >
        Sample boxes
      </button>
    </div>
  );
}
