// Frame capture for /detect calls. Pulled out of useLiveSession so the
// scaling math (the one part worth getting precisely right) can be
// reasoned about on its own; the actual canvas/video APIs it calls are
// real browser APIs with no meaningful fake in jsdom, so this is covered
// by manual testing on a real phone rather than Vitest -- see
// handover.md.

/** Draws the current frame of `video` onto an offscreen canvas, scaled so
 * its longest side is at most `maxDimension`, and returns it as a base64
 * JPEG (no `data:` prefix, matching what the backend's `/detect` and
 * `/segment` expect). Returns null if the video has no frame yet. */
export function captureFrameAsJpegBase64(
  video: HTMLVideoElement,
  options: { maxDimension?: number; quality?: number } = {},
): string | null {
  const { maxDimension = 1024, quality = 0.7 } = options;
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return null;

  const scale = Math.min(1, maxDimension / Math.max(videoWidth, videoHeight));
  const width = Math.round(videoWidth * scale);
  const height = Math.round(videoHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex === -1 ? null : dataUrl.slice(commaIndex + 1);
}
