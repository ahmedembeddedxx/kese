// Orchestrates one repair session: camera + mic capture, the Gemini Live
// WebSocket, and dispatching the agent's tool calls into the stores.
//
// The camera/mic/WebSocket wiring here is NOT YET EXERCISED on a real
// device with a real Gemini key (see handover.md). The business logic it
// delegates to (toolHandlers.ts) is fully unit tested; this hook is the
// thin, hard-to-unit-test glue around real browser media APIs, meant to
// be verified by manual testing on a phone before the first demo.

import { useCallback, useRef, useState } from "react";
import { ApiClient } from "../../lib/apiClient";
import { getAuthToken } from "../../lib/auth";
import { PcmPlayer } from "../../lib/audio/pcmPlayer";
import { arrayBufferToBase64, base64ToArrayBuffer } from "../../lib/base64";
import { captureFrameAsJpegBase64 } from "../../lib/camera";
import type { Category, PlaybookDetail } from "../../lib/types";
import { useOverlayStore } from "../../store/overlayStore";
import { useSessionStore } from "../../store/sessionStore";
import { openLiveSession, type LiveSessionHandle } from "./geminiLiveClient";
import { createToolDispatcher } from "./toolHandlers";
// `?worker&url` makes Vite bundle this file as its own chunk and give us
// its built URL as a plain string -- the only reliable way to get an
// AudioWorklet module loadable in both dev and a production build. See
// decisions.md D-009.
import pcmRecorderWorkletUrl from "../../lib/audio/pcmRecorderWorklet.ts?worker&url";

const VIDEO_FRAME_INTERVAL_MS = 1000;

export type LiveStatus = "idle" | "connecting" | "live" | "ended" | "error";

export interface UseLiveSessionArgs {
  apiBaseUrl: string;
}

export function useLiveSession({ apiBaseUrl }: UseLiveSessionArgs) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveHandleRef = useRef<LiveSessionHandle | null>(null);
  const mediaStreamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const pcmPlayerRef = useRef<PcmPlayer | null>(null);

  const apiClientRef = useRef(
    new ApiClient({ baseUrl: apiBaseUrl, getAuthToken: () => getAuthToken() }),
  );

  function cleanupMedia() {
    if (frameIntervalRef.current !== null) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    for (const stream of mediaStreamsRef.current) {
      for (const track of stream.getTracks()) track.stop();
    }
    mediaStreamsRef.current = [];
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    liveHandleRef.current?.close();
    liveHandleRef.current = null;
  }

  const startSession = useCallback(
    async (category: Category, playbookId?: string) => {
      setStatus("connecting");
      setErrorMessage(null);
      const apiClient = apiClientRef.current;
      const language = useSessionStore.getState().language;

      try {
        const [session, gates, playbook] = await Promise.all([
          apiClient.createSession({ category, playbookId, language }),
          apiClient.getGates(),
          playbookId ? apiClient.getPlaybook(playbookId) : Promise.resolve<PlaybookDetail | null>(null),
        ]);

        const sessionId = crypto.randomUUID();
        useSessionStore.getState().setSession(session, sessionId);

        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamsRef.current = [cameraStream, micStream];

        if (videoRef.current) {
          videoRef.current.srcObject = cameraStream;
          await videoRef.current.play().catch(() => {
            // iOS requires a user gesture before audio/video can play; the
            // Start button that calls startSession() counts as that
            // gesture, but older WebKit sometimes still needs a retry.
          });
        }

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        pcmPlayerRef.current = new PcmPlayer(audioContext);
        await audioContext.audioWorklet.addModule(pcmRecorderWorkletUrl);
        const micSource = audioContext.createMediaStreamSource(micStream);
        const recorderNode = new AudioWorkletNode(audioContext, "pcm-recorder");
        micSource.connect(recorderNode);

        const dispatch = createToolDispatcher({
          apiClient,
          captureFrame: () => (videoRef.current ? captureFrameAsJpegBase64(videoRef.current) : null),
          sessionId,
          getPlaybook: () => playbook,
          getGates: () => gates,
        });

        const liveHandle = await openLiveSession({
          ephemeralToken: session.ephemeral_token,
          model: session.live_model,
          toolDeclarations: session.tool_declarations,
          callbacks: {
            onAudioBase64: (pcm16Base64) => {
              pcmPlayerRef.current?.enqueue(base64ToArrayBuffer(pcm16Base64));
            },
            onToolCall: (name, args, callId) => {
              void dispatch(name, args).then((result) => {
                liveHandleRef.current?.sendToolResponse(callId, result as Record<string, unknown>);
              });
            },
            onTurnComplete: () => setListening(true),
            onError: (error) => {
              setErrorMessage(String(error));
              setStatus("error");
            },
            onClose: () => setStatus((prev) => (prev === "error" ? prev : "ended")),
          },
        });
        liveHandleRef.current = liveHandle;

        recorderNode.port.onmessage = (event: MessageEvent<{ pcm16: Int16Array }>) => {
          setListening(false);
          liveHandleRef.current?.sendAudioChunkBase64(
            arrayBufferToBase64(event.data.pcm16.buffer as ArrayBuffer),
          );
        };

        frameIntervalRef.current = window.setInterval(() => {
          if (!videoRef.current) return;
          const frame = captureFrameAsJpegBase64(videoRef.current);
          if (frame) liveHandleRef.current?.sendVideoFrameJpegBase64(frame);
        }, VIDEO_FRAME_INTERVAL_MS);

        setStatus("live");
      } catch (error) {
        cleanupMedia();
        setErrorMessage(String(error));
        setStatus("error");
      }
    },
    [],
  );

  const endSession = useCallback(() => {
    cleanupMedia();
    setStatus("ended");
  }, []);

  const confirmGate = useCallback((checkId: string) => {
    useOverlayStore.getState().confirmGate();
    const sessionId = useSessionStore.getState().sessionId;
    if (!sessionId) return;
    void apiClientRef.current.recordEvent({
      sessionId,
      kind: "gate_confirmed",
      detail: { check_id: checkId },
    });
  }, []);

  return { status, errorMessage, listening, videoRef, startSession, endSession, confirmGate };
}
