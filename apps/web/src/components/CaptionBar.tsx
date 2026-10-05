// Live captions: what you said (muted) and what Mend is saying (bright).
// Homes and garages are loud, so everything spoken is also readable. The
// text is bidi-aware (`dir="auto"`) because a reply can switch languages
// mid-sentence, and uses the compact Naskh face so two lines fit above
// the controls.

import { useLiveStore } from "../store/liveStore";

export function CaptionBar() {
  const user = useLiveStore((s) => s.userCaption);
  const agent = useLiveStore((s) => s.agentCaption);
  if (!user && !agent) return null;

  return (
    <div
      className="pointer-events-none flex flex-col gap-1.5 px-1 text-center [text-shadow:0_1px_8px_rgb(0_0_0/0.8)]"
      aria-live="polite"
      data-testid="captions"
    >
      {user && (
        <p dir="auto" className="line-clamp-2 text-[15px] leading-6 text-white/70">
          {user}
        </p>
      )}
      {agent && (
        <p dir="auto" className="line-clamp-3 text-xl font-medium leading-8 text-white">
          {agent}
        </p>
      )}
    </div>
  );
}
