// Orchestrates one repair session: camera, microphone, the Gemini Live
// socket (the "brain" that sees video) and the voice stack that listens
// and speaks.
//
// Two voice stacks, chosen by the server (`session.voice.provider`):
//   elevenlabs  Gemini runs in TEXT mode. ElevenLabs Scribe turns the
//               mic into text (Urdu capable) and ElevenLabs TTS speaks the
//               reply. Gemini never receives audio.
//   gemini      Gemini native audio both ways. Used when ElevenLabs is not
//               configured, fails to start, or fails mid-session.
// If ElevenLabs fails the session restarts once on the Gemini stack, so
// the user is never left without a voice.
//
// NOT YET EXERCISED against live Gemini/ElevenLabs keys (none available in
// the build sandbox). The decision logic lives in small tested modules
// (phase.ts, toolHandlers.ts, voice/*, geminiLiveClient.ts,
// cameraController.ts); this hook is the glue around real media APIs.

import { useCallback, useEffect, useRef } from "react";
import { PcmPlayer } from "../../lib/audio/pcmPlayer";
import { ApiClient, ApiError } from "../../lib/apiClient";
import { getAuthToken } from "../../lib/auth";
import { arrayBufferToBase64, base64ToArrayBuffer } from "../../lib/base64";
import { captureFrameAsJpegBase64 } from "../../lib/camera";
import { CameraController, CameraError, type VideoSource } from "../../lib/cameraController";
import type { Category, PlaybookDetail, SessionResponse } from "../../lib/types";
import { LevelSmoother, pcm16Rms } from "../../lib/voice/audioLevel";
import { ScribeClient } from "../../lib/voice/scribeClient";
import { SpeechChunker } from "../../lib/voice/sentenceChunker";
import { TtsStream } from "../../lib/voice/ttsStream";
import { useLiveStore, type LiveError } from "../../store/liveStore";
import { useOverlayStore } from "../../store/overlayStore";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { ChatRecorder } from "./chatRecorder";
import { type LiveSessionHandle, openLiveSession } from "./geminiLiveClient";
import { runMockLive } from "./mockLive";
import { derivePhase } from "./phase";
import { createToolDispatcher } from "./toolHandlers";
// `?worker&url` makes Vite bundle this file as its own chunk and give us
// its built URL as a plain string -- the only reliable way to get an
// AudioWorklet module loadable in both dev and a production build. See
// decisions.md D-009.
import pcmRecorderWorkletUrl from "../../lib/audio/pcmRecorderWorklet.ts?worker&url";

const VIDEO_FRAME_INTERVAL_MS = 1000;
const PHASE_POLL_MS = 120;
/** Live API takes 16 kHz mic audio; also what Scribe expects. */
const MIC_SAMPLE_RATE = 16_000;
const MIN_BARGE_IN_CHARS = 3;

class ElevenLabsStartError extends Error {}

/** Base64 of exactly the bytes of an Int16Array view (it may window a larger buffer). */
function toBase64(view: Int16Array): string {
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return arrayBufferToBase64(copy.buffer);
}

export const IS_MOCK_LIVE = import.meta.env.VITE_MOCK_LIVE === "1";

function classifyError(error: unknown): LiveError {
  if (error instanceof CameraError) {
    return { kind: error.reason === "denied" ? "camera" : "generic" };
  }
  if (error instanceof ApiError) {
    if (error.status === 403) return { kind: "consent" };
    if (error.status === 400) return { kind: "option" };
    if (error.status === 429) return { kind: "busy" };
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") return { kind: "mic" };
  return { kind: "generic" };
}

function recordToolEvent(
  recorder: ChatRecorder | null,
  name: string,
  args: unknown,
  result: unknown,
  playbook: PlaybookDetail | null,
): void {
  if (!recorder || (result as { ok?: boolean } | null)?.ok !== true) return;
  if (name === "advance_step") {
    const stepId = (args as { step_id?: string } | null)?.step_id;
    const step = playbook?.steps.find((st) => st.id === stepId);
    const index = playbook?.steps.findIndex((st) => st.id === stepId) ?? -1;
    if (step) recorder.event(`Step ${index + 1}: ${step.say}`);
  } else if (name === "safety_gate") {
    recorder.event("Safety check");
  }
}

export interface UseLiveSessionArgs {
  apiBaseUrl: string;
}

export function useLiveSession({ apiBaseUrl }: UseLiveSessionArgs) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const levelRef = useRef(0);

  const cameraRef = useRef<CameraController | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const liveRef = useRef<LiveSessionHandle | null>(null);
  const scribeRef = useRef<ScribeClient | null>(null);
  const ttsRef = useRef<TtsStream | null>(null);
  const chunkerRef = useRef(new SpeechChunker());
  const smootherRef = useRef(new LevelSmoother());
  const timersRef = useRef<number[]>([]);
  const stopMockRef = useRef<(() => void) | null>(null);
  const recorderRef = useRef<ChatRecorder | null>(null);
  const recapRef = useRef<string | null>(null);
  // Bumped by every start() and cleanup() so a start that was superseded
  // (React dev double-mount, quick retry) stops touching shared state.
  const startTokenRef = useRef(0);
  // Handheld-camera drift for the keyless demo, in the scene's 0-1000 units.
  const driftRef = useRef({ x: 0, y: 0 });

  // Mutable flags read by the phase poller. Refs, not state: they change
  // from socket callbacks and must not re-render the tree.
  const flagsRef = useRef({
    connected: false,
    reconnecting: false,
    awaitingReply: false,
    agentTurnOpen: false,
    micLevelRaw: 0,
    ended: false,
    fallbackUsed: false,
    generation: 0,
  });

  const apiClientRef = useRef(
    new ApiClient({ baseUrl: apiBaseUrl, getAuthToken: () => getAuthToken() }),
  );

  const cleanup = useCallback(() => {
    flagsRef.current.generation++;
    startTokenRef.current++;
    flagsRef.current.connected = false;
    for (const id of timersRef.current) window.clearInterval(id);
    timersRef.current = [];
    stopMockRef.current?.();
    stopMockRef.current = null;
    recorderRef.current?.close();
    recorderRef.current = null;
    scribeRef.current?.close();
    scribeRef.current = null;
    ttsRef.current?.close();
    ttsRef.current = null;
    liveRef.current?.close();
    liveRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    cameraRef.current?.stop();
    cameraRef.current = null;
    for (const track of micStreamRef.current?.getTracks() ?? []) track.stop();
    micStreamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    chunkerRef.current.reset();
    smootherRef.current.reset();
    levelRef.current = 0;
  }, []);

  const bargeIn = useCallback(() => {
    recorderRef.current?.finishAgent();
    playerRef.current?.stop();
    ttsRef.current?.stop();
    chunkerRef.current.reset();
  }, []);

  const begin = useCallback(
    async (category: Category, playbookId: string | null, forceGemini: boolean) => {
      const flags = flagsRef.current;
      const generation = ++flags.generation;
      const stale = () => generation !== flags.generation || flags.ended;
      const live = useLiveStore.getState();
      const settings = useSettingsStore.getState();
      const apiClient = apiClientRef.current;

      live.reset();
      useOverlayStore.getState().clearHighlights();
      flags.connected = false;
      flags.reconnecting = false;
      flags.awaitingReply = false;
      flags.agentTurnOpen = false;

      try {
        // Camera first: the picture is on screen immediately, before any
        // network call, and a missing permission is reported straight away.
        const camera = new CameraController(() => void switchSource("environment"));
        cameraRef.current = camera;
        await attachCamera(camera, "environment");
        if (stale()) return;

        const [session, gates, playbook] = await Promise.all([
          apiClient.createSession({
            category,
            playbookId: playbookId ?? undefined,
            voiceProvider: forceGemini ? "gemini" : settings.voiceProvider,
            voiceId: settings.voiceId,
            liveModel: settings.liveModel,
            ttsModel: settings.ttsModel,
            consent: useSessionStore.getState().consented,
          }),
          apiClient.getGates(),
          playbookId
            ? apiClient.getPlaybook(playbookId)
            : Promise.resolve<PlaybookDetail | null>(null),
        ]);
        if (stale()) return;

        useLiveStore.getState().setPlaybook(playbook);
        const sessionId = crypto.randomUUID();
        useSessionStore.getState().setSession(session, sessionId);
        useLiveStore.getState().setVoice(session.voice.provider, forceGemini);

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        micStreamRef.current = micStream;
        if (stale()) return;

        const audioContext = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
        audioContextRef.current = audioContext;
        await audioContext.resume().catch(() => {});
        playerRef.current = new PcmPlayer(audioContext);
        await audioContext.audioWorklet.addModule(pcmRecorderWorkletUrl);
        const recorder = new AudioWorkletNode(audioContext, "pcm-recorder");
        audioContext.createMediaStreamSource(micStream).connect(recorder);

        const elevenlabs = session.voice.provider === "elevenlabs" ? session.voice.elevenlabs : null;
        const textMode = Boolean(elevenlabs);

        if (elevenlabs) {
          await startElevenLabs(elevenlabs, apiClient, stale);
          if (stale()) return;
        }

        const dispatch = createToolDispatcher({
          apiClient,
          captureFrame: () =>
            videoRef.current ? captureFrameAsJpegBase64(videoRef.current) : null,
          sessionId,
          getPlaybook: () => playbook,
          getGates: () => gates,
        });

        const liveHandle = await openLiveSession({
          ephemeralToken: session.ephemeral_token,
          model: session.live_model,
          responseModality: textMode ? "TEXT" : "AUDIO",
          liveConfig: session.live_config,
          toolDeclarations: session.tool_declarations,
          callbacks: {
            onAudioBase64: (b64) => {
              flags.awaitingReply = false;
              playerRef.current?.enqueue(base64ToArrayBuffer(b64));
            },
            onModelText: (delta) => {
              flags.awaitingReply = false;
              if (!flags.agentTurnOpen) {
                flags.agentTurnOpen = true;
                useLiveStore.getState().setAgentCaption("");
              }
              useLiveStore.getState().appendAgentCaption(delta);
              recorderRef.current?.appendAgent(delta);
              for (const chunk of chunkerRef.current.push(delta)) ttsRef.current?.speak(chunk);
            },
            onInputTranscript: (text) => {
              // Gemini-audio stack only (TEXT mode gets no audio from us).
              flags.agentTurnOpen = false;
              flags.awaitingReply = true;
              useLiveStore.getState().appendUserCaption(text);
              recorderRef.current?.appendUser(text);
            },
            onOutputTranscript: (text) => {
              if (textMode) return; // captions come from the text deltas
              if (!flags.agentTurnOpen) {
                flags.agentTurnOpen = true;
                useLiveStore.getState().setAgentCaption("");
                useLiveStore.getState().setUserCaption("");
              }
              useLiveStore.getState().appendAgentCaption(text);
              recorderRef.current?.appendAgent(text);
            },
            onToolCall: (name, args, callId) => {
              void dispatch(name, args).then((result) => {
                recordToolEvent(recorderRef.current, name, args, result, playbook);
                liveRef.current?.sendToolResponse(callId, result as Record<string, unknown>);
              });
            },
            onTurnComplete: () => {
              flags.agentTurnOpen = false;
              recorderRef.current?.finishAgent();
              for (const chunk of chunkerRef.current.flush()) ttsRef.current?.speak(chunk);
              ttsRef.current?.endTurn();
            },
            onInterrupted: () => bargeIn(),
            onReconnecting: () => {
              flags.reconnecting = true;
            },
            onReconnected: () => {
              flags.reconnecting = false;
            },
            onError: () => {
              // Terminal failures arrive via onClose; transient errors are
              // retried inside the client.
            },
            onClose: () => {
              if (!flags.ended && generation === flags.generation) {
                cleanup();
                useLiveStore.getState().fail({ kind: "generic" });
              }
            },
          },
        });
        if (stale()) {
          liveHandle.close();
          return;
        }
        liveRef.current = liveHandle;
        if (recapRef.current) liveHandle.sendText(recapRef.current);

        recorder.port.onmessage = (event: MessageEvent<{ pcm16: Int16Array }>) => {
          const pcm = event.data.pcm16;
          flags.micLevelRaw = useLiveStore.getState().micMuted ? 0 : pcm16Rms(pcm);
          if (useLiveStore.getState().micMuted) return;
          if (elevenlabs) {
            scribeRef.current?.sendAudio(pcm);
          } else {
            liveRef.current?.sendAudioChunkBase64(
              toBase64(pcm),
            );
          }
        };

        timersRef.current.push(
          window.setInterval(() => {
            const video = videoRef.current;
            if (!video) return;
            const frame = captureFrameAsJpegBase64(video);
            if (frame) liveRef.current?.sendVideoFrameJpegBase64(frame);
          }, VIDEO_FRAME_INTERVAL_MS),
          window.setInterval(() => pollPhaseAndLevel(), PHASE_POLL_MS),
        );

        flags.connected = true;
        useLiveStore.getState().setPhase("listening");
      } catch (error) {
        if (stale()) return;
        // ElevenLabs is optional: any failure on that stack restarts once
        // on Gemini audio rather than failing the whole session.
        if (!forceGemini && !flags.fallbackUsed && error instanceof ElevenLabsStartError) {
          flags.fallbackUsed = true;
          cleanup();
          await begin(category, playbookId, true);
          return;
        }
        cleanup();
        useLiveStore.getState().fail(classifyError(error));
      }
    },
    // The refs and store accessors used inside are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function startElevenLabs(
    voice: NonNullable<SessionResponse["voice"]["elevenlabs"]>,
    apiClient: ApiClient,
    stale: () => boolean,
  ): Promise<void> {
    const flags = flagsRef.current;
    // The first token comes with the session; reconnects mint a new one
    // because ElevenLabs tokens are single use.
    let sttFirst: string | null = voice.stt.token;
    let ttsFirst: string | null = voice.tts.token;

    const tts = new TtsStream(
      {
        url: voice.tts.url,
        modelId: voice.tts.model_id,
        voiceId: voice.tts.voice_id,
        outputFormat: "pcm_24000",
        languageCode: voice.tts.language_code,
        getToken: async () => {
          if (ttsFirst) {
            const token = ttsFirst;
            ttsFirst = null;
            return token;
          }
          return apiClient.mintVoiceToken("tts");
        },
      },
      {
        onAudio: (pcm16) => playerRef.current?.enqueue(pcm16),
        onTurnEnd: () => {},
        onError: () => {
          // Voice dropped mid-session: restart once on Gemini audio.
          if (flags.ended || flags.fallbackUsed) return;
          flags.fallbackUsed = true;
          const { category, playbookId } = useSessionStore.getState();
          if (!category) return;
          cleanup();
          void begin(category, playbookId, true);
        },
      },
    );
    ttsRef.current = tts;

    const scribe = new ScribeClient(
      {
        url: voice.stt.url,
        modelId: voice.stt.model_id,
        languageCode: voice.stt.language_code,
        audioFormat: "pcm_16000",
        commitStrategy: voice.stt.commit_strategy === "manual" ? "manual" : "vad",
        vadSilenceThresholdSecs: voice.stt.vad_silence_threshold_secs,
        getToken: async () => {
          if (sttFirst) {
            const token = sttFirst;
            sttFirst = null;
            return token;
          }
          return apiClient.mintVoiceToken("stt");
        },
      },
      {
        onPartial: (text) => {
          const trimmed = text.trim();
          if (trimmed.length >= MIN_BARGE_IN_CHARS) {
            if (flags.agentTurnOpen || ttsRef.current?.speaking || playerRef.current?.isPlaying()) {
              bargeIn();
            }
            useLiveStore.getState().setUserCaption(trimmed);
          }
        },
        onCommitted: (text) => {
          const trimmed = text.trim();
          if (!trimmed) return;
          bargeIn();
          flags.agentTurnOpen = false;
          flags.awaitingReply = true;
          useLiveStore.getState().setUserCaption(trimmed);
          recorderRef.current?.pushUser(trimmed);
          liveRef.current?.sendText(trimmed);
        },
        onError: () => {},
        onClose: () => {
          // Reconnect Scribe quietly; a fresh token is minted on connect.
          if (flags.ended || !flags.connected) return;
          void scribeRef.current?.connect().catch(() => {});
        },
      },
    );
    scribeRef.current = scribe;

    try {
      await scribe.connect();
    } catch (error) {
      if (stale()) return;
      throw new ElevenLabsStartError(String(error));
    }
  }

  async function attachCamera(camera: CameraController, source: VideoSource): Promise<void> {
    const stream = await camera.use(source);
    if (cameraRef.current !== camera) {
      // Superseded while the permission prompt was open: release it.
      camera.stop();
      return;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {
        // Autoplay can be refused until the next gesture; the Start tap
        // normally counts, and the video element is muted and inline.
      });
    }
    const caps = await camera.capabilities();
    useLiveStore.getState().setCameraState({
      cameraSource: source,
      canFlip: caps.canFlip,
      canShareScreen: caps.canShareScreen,
      torchSupported: caps.torchSupported,
      torchOn: false,
    });
  }

  async function switchSource(source: VideoSource): Promise<void> {
    const camera = cameraRef.current;
    if (!camera) return;
    try {
      await attachCamera(camera, source);
    } catch (error) {
      // A cancelled picker or a missing camera keeps the current source.
      if (!(error instanceof CameraError) || error.reason === "denied") {
        useLiveStore.getState().fail(classifyError(error));
      }
    }
  }

  function pollPhaseAndLevel(): void {
    const flags = flagsRef.current;
    const player = playerRef.current;
    const speaking = Boolean(player?.isPlaying() || ttsRef.current?.speaking);
    const phase = derivePhase({
      connected: flags.connected,
      failed: useLiveStore.getState().error !== null,
      reconnecting: flags.reconnecting,
      agentSpeaking: speaking,
      awaitingReply: flags.awaitingReply,
    });
    if (useLiveStore.getState().phase !== phase) useLiveStore.getState().setPhase(phase);
    const raw = speaking ? (player?.getLevel() ?? 0) : flags.micLevelRaw;
    levelRef.current = smootherRef.current.next(raw);
  }

  // ---- public controls -------------------------------------------------

  const start = useCallback(
    async (
      category: Category,
      playbookId: string | null,
      options: { resolveChatId: (() => string) | null; recap: string | null } = { resolveChatId: null, recap: null },
    ) => {
      const flags = flagsRef.current;
      const token = ++startTokenRef.current;
      flags.ended = false;
      flags.fallbackUsed = false;
      recorderRef.current?.close();
      recorderRef.current = options.resolveChatId ? new ChatRecorder(options.resolveChatId) : null;
      recapRef.current = options.recap;
      if (IS_MOCK_LIVE) {
        const live = useLiveStore.getState();
        live.reset();
        flags.connected = true;
        // Demo mode: use the real camera if the browser allows it (so the UI
        // can be judged over a live picture), otherwise show a drawn scene.
        const camera = new CameraController();
        cameraRef.current = camera;
        try {
          await attachCamera(camera, "environment");
          useLiveStore.getState().setDemoRealCamera(true);
        } catch {
          useLiveStore.getState().setCameraState({ canFlip: true, canShareScreen: true, torchSupported: true });
        }
        if (token !== startTokenRef.current) return;
        stopMockRef.current = runMockLive(levelRef, {
          showBoxes: !useLiveStore.getState().demoRealCamera,
          driftRef,
        });
        // A short scripted exchange so saved chats are not empty in the demo.
        const recorder = recorderRef.current;
        recorder?.pushUser("The ceiling fan hums but does not turn.");
        recorder?.appendAgent("That sounds like the capacitor. First, switch the fan off at the wall.");
        recorder?.finishAgent();
        recorder?.event("Step 2: Switch off the fan at the wall");
        return;
      }
      await begin(category, playbookId, false);
    },
    [begin],
  );

  const end = useCallback(() => {
    flagsRef.current.ended = true;
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    const live = useLiveStore.getState();
    live.setMicMuted(!live.micMuted);
  }, []);

  const flipCamera = useCallback(() => {
    const current = cameraRef.current?.currentSource ?? "environment";
    void switchSource(current === "environment" ? "user" : "environment");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleScreenShare = useCallback(() => {
    const current = cameraRef.current?.currentSource ?? "environment";
    void switchSource(current === "screen" ? "environment" : "screen");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = useCallback(() => {
    const live = useLiveStore.getState();
    const next = !live.torchOn;
    void cameraRef.current?.setTorch(next).then((ok) => {
      if (ok) useLiveStore.getState().setCameraState({ torchOn: next });
    });
  }, []);

  const decideGate = useCallback((checkId: string, confirmed: boolean) => {
    useOverlayStore.getState().confirmGate();
    liveRef.current?.sendText(
      confirmed
        ? `The user tapped "done" on safety check ${checkId}. You may continue.`
        : `The user tapped "not yet" on safety check ${checkId}. Do not continue until they are ready, and ask what they need.`,
    );
    const sessionId = useSessionStore.getState().sessionId;
    if (sessionId && confirmed) {
      void apiClientRef.current
        .recordEvent({ sessionId, kind: "gate_confirmed", detail: { check_id: checkId } })
        .catch(() => {});
    }
  }, []);

  // Release camera/mic if the screen unmounts mid-session.
  useEffect(() => {
    const flags = flagsRef.current;
    return () => {
      flags.ended = true;
      cleanup();
    };
  }, [cleanup]);

  return {
    videoRef,
    levelRef,
    driftRef,
    start,
    end,
    toggleMute,
    flipCamera,
    toggleScreenShare,
    toggleTorch,
    confirmGate: (checkId: string) => decideGate(checkId, true),
    declineGate: (checkId: string) => decideGate(checkId, false),
    getMirrored: () => cameraRef.current?.mirrored ?? false,
  };
}
