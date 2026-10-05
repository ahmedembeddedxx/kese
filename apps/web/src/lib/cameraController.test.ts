import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraController, CameraError, detectCapabilities } from "./cameraController";

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), getCapabilities: () => ({ torch: true }) };
  return {
    track,
    stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
  };
}

function installMedia(impl: Partial<MediaDevices>) {
  Object.defineProperty(navigator, "mediaDevices", { value: impl, configurable: true });
}

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
});

describe("detectCapabilities", () => {
  it("allows flipping only with more than one camera", () => {
    expect(detectCapabilities(undefined, 1).canFlip).toBe(false);
    expect(detectCapabilities(undefined, 2).canFlip).toBe(true);
  });

  it("allows screen sharing only when getDisplayMedia exists", () => {
    expect(detectCapabilities(undefined, 1).canShareScreen).toBe(false);
    const md = { getSupportedConstraints: () => ({}), getDisplayMedia: () => {} };
    expect(detectCapabilities(md, 1).canShareScreen).toBe(true);
  });
});

describe("CameraController", () => {
  it("keeps the old stream when a screen-share picker is cancelled", async () => {
    const a = fakeStream();
    installMedia({
      getUserMedia: vi.fn().mockResolvedValue(a.stream),
      getDisplayMedia: vi.fn().mockRejectedValue(new DOMException("x", "AbortError")),
    });
    const cam = new CameraController();
    await cam.use("environment");
    await expect(cam.use("screen")).rejects.toMatchObject({ reason: "cancelled" });
    expect(a.track.stop).not.toHaveBeenCalled();
    expect(cam.currentSource).toBe("environment");
  });

  it("stops the previous stream once the new one is acquired", async () => {
    const a = fakeStream();
    const b = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValueOnce(a.stream).mockResolvedValueOnce(b.stream);
    installMedia({ getUserMedia });
    const cam = new CameraController();
    await cam.use("environment");
    await cam.use("user");
    expect(a.track.stop).toHaveBeenCalledTimes(1);
    expect(cam.mirrored).toBe(true);
  });

  it("maps permission errors to a denied CameraError", async () => {
    installMedia({ getUserMedia: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")) });
    const cam = new CameraController();
    const err = await cam.use("environment").catch((e) => e);
    expect(err).toBeInstanceOf(CameraError);
    expect(err.reason).toBe("denied");
  });

  it("reports the torch only on the rear camera", async () => {
    const a = fakeStream();
    installMedia({ getUserMedia: vi.fn().mockResolvedValue(a.stream) });
    const cam = new CameraController();
    await cam.use("environment");
    expect(cam.torchSupported()).toBe(true);
    await cam.use("user");
    expect(cam.torchSupported()).toBe(false);
  });
});
