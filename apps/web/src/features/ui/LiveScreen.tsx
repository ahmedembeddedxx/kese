// The live repair screen: full-screen rear camera, the overlay canvas on
// top, the top bar (step/caption), the bottom mic bar, and the safety
// gate sheet when one is open. This is the core of the product, per the
// plan's UI rules.

import { useEffect, useRef, useState } from "react";
import { MicOrb } from "../../components/MicOrb";
import { SafetyGateSheet } from "../../components/SafetyGateSheet";
import { TopBar } from "../../components/TopBar";
import { useOverlayStore } from "../../store/overlayStore";
import { useSessionStore } from "../../store/sessionStore";
import { useLiveSession } from "../live/useLiveSession";
import { OverlayCanvas } from "../overlay/OverlayCanvas";

interface LiveScreenProps {
  apiBaseUrl: string;
}

export function LiveScreen({ apiBaseUrl }: LiveScreenProps) {
  const { category, playbookId, finishRepair, goHome } = useSessionStore();
  const clearHighlights = useOverlayStore((s) => s.clearHighlights);
  const { status, errorMessage, listening, videoRef, startSession, endSession, confirmGate } =
    useLiveSession({ apiBaseUrl });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!category) return;
    void startSession(category, playbookId ?? undefined);
    return () => {
      endSession();
      clearHighlights();
    };
    // Intentionally run once per mount: category/playbookId are fixed for
    // the lifetime of a single live session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleEnd() {
    endSession();
    finishRepair();
  }

  return (
    <div ref={containerRef} className="relative min-h-dvh bg-black overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
        data-testid="camera-video"
      />
      <OverlayCanvas width={canvasSize.width} height={canvasSize.height} />
      <TopBar />
      <MicOrb listening={listening} onRepeat={() => {}} onStuck={() => {}} onEnd={handleEnd} />
      <SafetyGateSheet onConfirm={confirmGate} />

      {status === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white">
          Connecting...
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 text-white px-6 text-center">
          <p data-testid="live-error">Something went wrong: {errorMessage}</p>
          <button
            type="button"
            onClick={goHome}
            className="min-h-12 px-6 rounded-xl bg-white/10"
          >
            Back home
          </button>
        </div>
      )}
    </div>
  );
}
