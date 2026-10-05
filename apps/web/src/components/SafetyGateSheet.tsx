// A bottom sheet that must be tapped, never just answered by voice, per
// the plan's safety layer ("gates need a tap on screen, not just a
// spoken yes"). Two honest choices: "done" or "not yet". "Not yet" is as
// prominent as the confirm, so nobody feels pushed into saying yes.

import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/useI18n";
import { useOverlayStore } from "../store/overlayStore";
import { ShieldIcon } from "./icons";

interface SafetyGateSheetProps {
  onConfirm: (checkId: string) => void;
  onNotYet: (checkId: string) => void;
}

export function SafetyGateSheet({ onConfirm, onNotYet }: SafetyGateSheetProps) {
  const gate = useOverlayStore((s) => s.activeGate);
  const { t, language } = useI18n();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (gate) confirmRef.current?.focus();
  }, [gate]);

  if (!gate) return null;

  const prompt = language === "ur" ? gate.promptUr : gate.promptEn;
  const confirmLabel = language === "ur" ? gate.confirmLabelUr : gate.confirmLabelEn;

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/45 fade-in">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        aria-describedby="gate-prompt"
        data-testid="safety-gate-sheet"
        className="glass glass-strong sheet-in w-full rounded-t-[28px] px-5 pt-5 pb-[calc(1.25rem+var(--safe-bottom))] lg:mx-auto lg:mb-8 lg:max-w-md lg:rounded-[28px]"
      >
        <div className="mb-3 flex items-center gap-2 text-live">
          <ShieldIcon size={22} />
          <h2 id="gate-title" className="text-sm font-semibold tracking-wide">
            {t("gateTitle")}
          </h2>
        </div>
        <p id="gate-prompt" lang={language} className="mb-5 text-xl leading-relaxed text-white">
          {prompt}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onNotYet(gate.checkId)}
            className="min-h-[52px] rounded-2xl bg-white/14 px-4 text-base font-semibold text-white active:scale-[0.98]"
          >
            {t("gateNotYet")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onConfirm(gate.checkId)}
            className="min-h-[52px] rounded-2xl bg-live px-4 text-base font-semibold text-live-fg active:scale-[0.98]"
          >
            {confirmLabel || t("gateConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
