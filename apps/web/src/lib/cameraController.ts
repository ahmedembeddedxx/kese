// Owns the video source behind the full-screen camera: rear/front camera,
// screen sharing and the torch. Pure browser media, no React, so the hook
// can swap sources without caring how each one is acquired. Real devices
// are the only meaningful test of the media calls themselves; the
// decision logic (what is supported, what to fall back to) is covered by
// cameraController.test.ts with a fake mediaDevices.

export type VideoSource = "environment" | "user" | "screen";

export interface CameraCapabilities {
  canFlip: boolean;
  canShareScreen: boolean;
  torchSupported: boolean;
}

export class CameraError extends Error {
  readonly reason: "denied" | "unavailable" | "cancelled";
  constructor(reason: CameraError["reason"], message: string) {
    super(message);
    this.name = "CameraError";
    this.reason = reason;
  }
}

function toCameraError(error: unknown): CameraError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new CameraError("denied", "Camera permission was denied");
  }
  if (name === "AbortError") return new CameraError("cancelled", "Selection cancelled");
  return new CameraError("unavailable", "No usable camera found");
}

type TorchConstraints = MediaTrackConstraints & { advanced?: { torch?: boolean }[] };

export function detectCapabilities(
  mediaDevices: Pick<MediaDevices, "getSupportedConstraints"> & {
    getDisplayMedia?: unknown;
  } | undefined,
  videoInputCount: number,
): Omit<CameraCapabilities, "torchSupported"> {
  return {
    canFlip: videoInputCount > 1,
    canShareScreen: typeof mediaDevices?.getDisplayMedia === "function",
  };
}

export class CameraController {
  private stream: MediaStream | null = null;
  private source: VideoSource = "environment";
  private readonly onEnded: () => void;

  /** `onEnded` fires when the user stops a screen share from the browser UI. */
  constructor(onEnded: () => void = () => {}) {
    this.onEnded = onEnded;
  }

  get currentSource(): VideoSource {
    return this.source;
  }

  get mirrored(): boolean {
    return this.source === "user";
  }

  async capabilities(): Promise<CameraCapabilities> {
    let inputs = 0;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      inputs = devices.filter((d) => d.kind === "videoinput").length;
    } catch {
      inputs = 0;
    }
    const base = detectCapabilities(navigator.mediaDevices, inputs);
    return { ...base, torchSupported: this.torchSupported() };
  }

  torchSupported(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || this.source !== "environment") return false;
    try {
      const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
      return Boolean(caps?.torch);
    } catch {
      return false;
    }
  }

  async setTorch(on: boolean): Promise<boolean> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || !this.torchSupported()) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] } as TorchConstraints);
      return true;
    } catch {
      return false;
    }
  }

  /** Switch to `source` and return the new stream. The old one is stopped
   * only after the new one is acquired, so a cancelled screen-share
   * picker never leaves the user without a camera. */
  async use(source: VideoSource): Promise<MediaStream> {
    let next: MediaStream;
    try {
      if (source === "screen") {
        next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      } else {
        next = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: source },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      }
    } catch (error) {
      throw toCameraError(error);
    }

    this.stop();
    this.stream = next;
    this.source = source;
    if (source === "screen") {
      next.getVideoTracks()[0]?.addEventListener("ended", () => this.onEnded());
    }
    return next;
  }

  stop(): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
  }
}
