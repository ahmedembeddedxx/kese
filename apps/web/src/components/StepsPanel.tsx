// Playbook progress. On a phone it is a small chip at the top (the camera
// stays the hero); on a wide screen it becomes a side panel listing every
// step. The agent drives the current step; this never advances by itself.

import { useI18n } from "../i18n/useI18n";
import { useLiveStore } from "../store/liveStore";
import { useOverlayStore } from "../store/overlayStore";
import { CheckIcon } from "./icons";

export function StepChip() {
  const { t } = useI18n();
  const stepIndex = useOverlayStore((s) => s.stepIndex);
  const stepCount = useOverlayStore((s) => s.stepCount);
  if (stepCount === 0) return null;
  return (
    <div
      className="glass rounded-full px-3.5 py-2 text-sm font-semibold lg:hidden"
      data-testid="step-chip"
    >
      {t("stepOf", { n: stepIndex, total: stepCount })}
    </div>
  );
}

export function StepsPanel() {
  const { t } = useI18n();
  const playbook = useLiveStore((s) => s.playbook);
  const stepIndex = useOverlayStore((s) => s.stepIndex);
  if (!playbook) return null;

  return (
    <aside
      className="glass absolute end-6 top-6 z-10 hidden max-h-[calc(100%-10rem)] w-80 flex-col overflow-hidden rounded-[28px] lg:flex"
      data-testid="steps-panel"
      aria-label={t("stepsTitle")}
    >
      <h2 className="px-5 pt-5 pb-3 text-sm font-semibold tracking-wide text-white/70">
        {playbook.title}
      </h2>
      <ol className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {playbook.steps.map((step, i) => {
          const done = i + 1 < stepIndex;
          const current = i + 1 === stepIndex;
          return (
            <li
              key={step.id}
              aria-current={current ? "step" : undefined}
              className={`flex items-start gap-3 rounded-2xl px-3 py-2.5 ${current ? "bg-white/14" : ""}`}
            >
              <span
                className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done ? "bg-live text-live-fg" : current ? "bg-white text-black" : "bg-white/15 text-white/70"
                }`}
              >
                {done ? <CheckIcon size={14} strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={`text-[15px] leading-7 ${current ? "text-white" : done ? "text-white/55" : "text-white/75"}`}
              >
                {step.say}
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
