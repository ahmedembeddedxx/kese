// A bottom sheet that must be tapped, never just answered by voice, per
// the plan's safety layer ("gates need a tap on screen, not just a
// spoken yes").

import { useOverlayStore } from "../store/overlayStore";
import { useSessionStore } from "../store/sessionStore";

interface SafetyGateSheetProps {
  onConfirm: (checkId: string) => void;
}

export function SafetyGateSheet({ onConfirm }: SafetyGateSheetProps) {
  const gate = useOverlayStore((s) => s.activeGate);
  const language = useSessionStore((s) => s.language);

  if (!gate) return null;

  const prompt = language === "ur" ? gate.promptUr : gate.promptEn;
  const confirmLabel = language === "ur" ? gate.confirmLabelUr : gate.confirmLabelEn;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="absolute inset-x-0 bottom-0 z-20 rounded-t-2xl bg-neutral-900 border-t border-white/10 p-5"
      data-testid="safety-gate-sheet"
    >
      <p className="text-white text-lg mb-4" lang={language}>
        {prompt}
      </p>
      <button
        type="button"
        onClick={() => onConfirm(gate.checkId)}
        className="w-full min-h-12 rounded-xl bg-emerald-500 text-black font-medium text-base"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
