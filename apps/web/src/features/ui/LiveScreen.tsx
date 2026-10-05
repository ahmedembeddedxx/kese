// The live repair screen. One job: point the camera and talk.
//   - the camera fills the whole screen (nothing is letterboxed)
//   - a single row of glass controls floats at the bottom:
//       flip camera, share screen, voice pill, mic, end
//   - boxes the agent draws stick to the parts; captions sit above the row
// There are deliberately no "Repeat" or "I'm stuck" buttons: the agent
// sees and hears, so the user just says it (or points).

import { useEffect } from "react";
import { CaptionBar } from "../../components/CaptionBar";
import { GlassButton } from "../../components/GlassButton";
import {
  CloseIcon,
  FlipCameraIcon,
  MicIcon,
  MicOffIcon,
  ScreenShareIcon,
  TorchIcon,
} from "../../components/icons";
import { SafetyGateSheet } from "../../components/SafetyGateSheet";
import { StepChip, StepsPanel } from "../../components/StepsPanel";
import { VoicePill } from "../../components/VoicePill";
import { useI18n } from "../../i18n/useI18n";
import type { StringKey } from "../../i18n/strings";
import type { ApiClient } from "../../lib/apiClient";
import type { Point1000 } from "../../lib/types";
import { captureFrameAsJpegBase64 } from "../../lib/camera";
import { type Phase, useLiveStore } from "../../store/liveStore";
import { useOverlayStore } from "../../store/overlayStore";
import { useChatStore } from "../../store/chatStore";
import { useSessionStore } from "../../store/sessionStore";
import { recapForAgent } from "../live/chatRecorder";
import { IS_MOCK_LIVE, useLiveSession } from "../live/useLiveSession";
import { MOCK_SCENE } from "../live/mockScene";
import { MockDemoBar } from "../../components/MockDemoBar";
import { OverlayCanvas } from "../overlay/OverlayCanvas";

const PHASE_LABEL: Record<Phase, StringKey> = {
  connecting: "connecting",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  reconnecting: "reconnecting",
  error: "errorGeneric",
};

const ERROR_KEY = {
  camera: "errorCamera",
  mic: "errorMic",
  consent: "errorConsent",
  option: "errorOption",
  busy: "errorBusy",
  generic: "errorGeneric",
} as const satisfies Record<string, StringKey>;

interface LiveScreenProps {
  apiBaseUrl: string;
  apiClient: ApiClient;
}

export function LiveScreen({ apiBaseUrl, apiClient }: LiveScreenProps) {
  const { t } = useI18n();
  const { category, playbookId, finishRepair, goHome, pendingChatId, pendingTitle, beginChat } = useSessionStore();
  const live = useLiveStore();
  const hintEn = useOverlayStore((s) => s.pendingWireHintEn);
  const session = useLiveSession({ apiBaseUrl });
  const { videoRef, levelRef, driftRef, start, end } = session;

  // Starts (or restarts, on Retry) the session. Resumes the chosen chat, or
  // opens a new one the moment something is said, so a session where nobody
  // speaks leaves nothing behind.
  function launch() {
    if (!category) return;
    const existing = pendingChatId
      ? useChatStore.getState().chats.find((c) => c.id === pendingChatId)
      : undefined;
    if (existing) beginChat(existing.id);
    void start(category, playbookId, {
      resolveChatId: () => {
        if (existing) return existing.id;
        const active = useSessionStore.getState().activeChatId;
        if (active) return active;
        const id = useChatStore
          .getState()
          .createChat({ category, playbookId, title: pendingTitle ?? undefined });
        beginChat(id);
        return id;
      },
      recap: existing ? recapForAgent(existing.messages) : null,
    });
  }

  useEffect(() => {
    launch();
    return () => {
      end();
      useOverlayStore.getState().clearHighlights();
    };
    // One live session per mount: category/playbook are fixed for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEnd() {
    end();
    finishRepair();
  }

  async function handleTapPoint(point: Point1000) {
    const overlay = useOverlayStore.getState();
    overlay.clearWireTapRequest();
    const video = videoRef.current;
    const frame = video ? captureFrameAsJpegBase64(video) : null;
    if (!frame) return;
    try {
      const wire = await apiClient.segment({ imageB64: frame, point, hint: hintEn ?? undefined });
      overlay.addWire({
        id: wire.wire_id,
        polyline: wire.polyline,
        color: wire.suggested_color,
        label: wire.wire_id,
      });
    } catch {
      // The agent can ask again; a failed segment must not break the session.
    }
  }

  const mirrored = live.cameraSource === "user";
  const phaseLabel = t(PHASE_LABEL[live.phase]);
  const failed = live.phase === "error" && live.error;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black text-white"
      data-testid="live-screen"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover ${IS_MOCK_LIVE && !live.demoRealCamera ? "hidden" : ""}`}
        style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
        data-testid="camera-video"
      />
      {/* Scrims keep white controls and captions legible over any scene. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/70 to-transparent" />

      <OverlayCanvas
        videoRef={videoRef}
        mirrored={mirrored}
        onTapPoint={(p) => void handleTapPoint(p)}
        backdrop={IS_MOCK_LIVE && !live.demoRealCamera ? MOCK_SCENE : undefined}
        driftRef={IS_MOCK_LIVE && !live.demoRealCamera ? driftRef : undefined}
      />

      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 px-4 pt-[calc(0.75rem+var(--safe-top))]">
        <StepChip />
        <div className="flex-1" />
        {live.usingFallbackVoice && (
          <div className="glass rounded-full px-3 py-2 text-xs font-semibold">{t("voiceFallback")}</div>
        )}
        {live.torchSupported && (
          <GlassButton
            label={live.torchOn ? t("torchOff") : t("torchOn")}
            pressed={live.torchOn}
            onClick={session.toggleTorch}
          >
            <TorchIcon filled={live.torchOn} />
          </GlassButton>
        )}
      </div>

      <StepsPanel />
      {IS_MOCK_LIVE && <MockDemoBar />}

      {hintEn && (
        <div className="glass absolute inset-x-0 top-24 z-10 mx-auto w-fit rounded-full px-4 py-2 text-sm font-semibold">
          {t("tapWire")}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 px-4 pb-[calc(1rem+var(--safe-bottom))] lg:mx-auto lg:max-w-2xl">
        <CaptionBar />
        <p className="text-center text-sm font-medium text-white/80" aria-hidden="true">
          {phaseLabel}
        </p>
        {/* Media-style controls keep one fixed order. */}
        <div dir="ltr" className="flex items-center gap-2">
          <GlassButton
            label={t("flipCamera")}
            onClick={session.flipCamera}
            disabled={!live.canFlip || live.cameraSource === "screen"}
          >
            <FlipCameraIcon />
          </GlassButton>
          <GlassButton
            label={live.cameraSource === "screen" ? t("stopShare") : t("shareScreen")}
            pressed={live.cameraSource === "screen"}
            onClick={session.toggleScreenShare}
            disabled={!live.canShareScreen}
          >
            <ScreenShareIcon />
          </GlassButton>
          <VoicePill
            phase={live.phase}
            levelRef={levelRef}
            muted={live.micMuted}
            label={phaseLabel}
          />
          <GlassButton
            label={live.micMuted ? t("micOff") : t("micOn")}
            pressed={live.micMuted}
            onClick={session.toggleMute}
          >
            {live.micMuted ? <MicOffIcon /> : <MicIcon />}
          </GlassButton>
          <GlassButton label={t("endSession")} tone="danger" onClick={handleEnd}>
            <CloseIcon />
          </GlassButton>
        </div>
      </div>

      <SafetyGateSheet onConfirm={session.confirmGate} onNotYet={session.declineGate} />

      {failed && (
        <div
          role="alert"
          className="glass glass-strong fade-in absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 px-8 text-center"
        >
          <p data-testid="live-error" className="max-w-sm text-xl leading-relaxed">
            {t(ERROR_KEY[live.error!.kind])}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={goHome}
              className="min-h-[52px] rounded-2xl bg-white/14 px-6 text-base font-semibold"
            >
              {t("backHome")}
            </button>
            <button
              type="button"
              onClick={launch}
              className="min-h-[52px] rounded-2xl bg-live px-6 text-base font-semibold text-live-fg"
            >
              {t("retry")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
