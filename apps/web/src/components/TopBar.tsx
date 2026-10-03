// Always-on top bar: step progress and the current instruction as a
// caption, because homes and garages are noisy (per the plan's UI rules).

import { useOverlayStore } from "../store/overlayStore";
import { useSessionStore } from "../store/sessionStore";

export function TopBar() {
  const { stepIndex, stepCount, captionEn, captionUr } = useOverlayStore();
  const language = useSessionStore((s) => s.language);
  const caption = language === "ur" ? captionUr : captionEn;

  return (
    <div className="absolute top-0 inset-x-0 z-10 bg-black/60 backdrop-blur-sm px-4 pt-[env(safe-area-inset-top)] pb-3">
      {stepCount > 0 && (
        <p className="text-xs uppercase tracking-wide text-white/60 mb-1">
          Step {stepIndex} of {stepCount}
        </p>
      )}
      <p className="text-base text-white" lang={language} data-testid="top-bar-caption">
        {caption || "Point your camera at what you want to fix."}
      </p>
    </div>
  );
}
