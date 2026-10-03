// Bottom bar: a mic status orb plus Repeat / I'm stuck / End, per the
// plan's UI rules. Tap targets are at least 48px.

interface MicOrbProps {
  listening: boolean;
  onRepeat: () => void;
  onStuck: () => void;
  onEnd: () => void;
}

export function MicOrb({ listening, onRepeat, onStuck, onEnd }: MicOrbProps) {
  return (
    <div className="absolute bottom-0 inset-x-0 z-10 bg-black/60 backdrop-blur-sm px-4 pb-[env(safe-area-inset-bottom)] pt-3">
      <div className="flex items-center justify-center mb-3">
        <div
          data-testid="mic-orb"
          aria-label={listening ? "Listening" : "Not listening"}
          className={`h-12 w-12 rounded-full border-2 transition-colors ${
            listening ? "bg-cyan-400/80 border-cyan-300 animate-pulse" : "bg-white/10 border-white/30"
          }`}
        />
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRepeat}
          className="min-h-12 min-w-12 px-4 rounded-full bg-white/10 text-white text-sm"
        >
          Repeat
        </button>
        <button
          type="button"
          onClick={onStuck}
          className="min-h-12 min-w-12 px-4 rounded-full bg-white/10 text-white text-sm"
        >
          I'm stuck
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="min-h-12 min-w-12 px-4 rounded-full bg-red-500/80 text-white text-sm"
        >
          End
        </button>
      </div>
    </div>
  );
}
