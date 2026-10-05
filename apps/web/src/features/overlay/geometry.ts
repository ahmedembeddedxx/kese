// Pure coordinate math for the overlay canvas, kept separate from the
// drawing code so it's trivial to unit test without a real <canvas>.

import type { Box2D, Point1000 } from "../../lib/types";

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

/** Convert a 0-1000 normalized box (Gemini's box_2d convention: ymin,
 * xmin, ymax, xmax) into pixel coordinates for a canvas of the given
 * size. */
export function box2dToPixelRect(box: Box2D, canvasWidth: number, canvasHeight: number): PixelRect {
  const x = (box.xmin / 1000) * canvasWidth;
  const y = (box.ymin / 1000) * canvasHeight;
  const width = ((box.xmax - box.xmin) / 1000) * canvasWidth;
  const height = ((box.ymax - box.ymin) / 1000) * canvasHeight;
  return { x, y, width, height };
}

export function point1000ToPixel(point: Point1000, canvasWidth: number, canvasHeight: number): PixelPoint {
  return { x: (point.x / 1000) * canvasWidth, y: (point.y / 1000) * canvasHeight };
}

export function polylineToPixels(
  points: Point1000[],
  canvasWidth: number,
  canvasHeight: number,
): PixelPoint[] {
  return points.map((p) => point1000ToPixel(p, canvasWidth, canvasHeight));
}

/** Stable, readable colours for up to 8 simultaneous highlights, chosen
 * for contrast against both light rooms and dark engine bays (per the
 * plan: "high-contrast colours, one colour per target"). */
export const HIGHLIGHT_PALETTE = [
  "#22D3EE", // cyan
  "#FACC15", // yellow
  "#F472B6", // pink
  "#4ADE80", // green
  "#FB923C", // orange
  "#A78BFA", // violet
  "#F87171", // red
  "#60A5FA", // blue
] as const;

export function colorForIndex(index: number): string {
  return HIGHLIGHT_PALETTE[index % HIGHLIGHT_PALETTE.length];
}

// ---------------------------------------------------------------------
// Object-fit: cover mapping. The camera <video> fills the whole screen
// with `object-fit: cover`, so the video frame is scaled up and its
// overflow is cropped. Detection coordinates are normalised to the FULL
// frame, so they must be mapped through the same scale + crop offset, or
// boxes drift away from the parts on any screen whose aspect ratio
// differs from the camera's (which is nearly all of them).
// ---------------------------------------------------------------------

export interface FrameFit {
  /** On-screen size of the container the video fills. */
  containerWidth: number;
  containerHeight: number;
  /** Intrinsic size of the video frame. */
  videoWidth: number;
  videoHeight: number;
  /** True for a front camera shown mirrored (CSS scaleX(-1)). */
  mirrored: boolean;
}

export interface CoverTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
}

/** Scale and (negative) offsets that `object-fit: cover` applies. */
export function coverTransform(fit: FrameFit): CoverTransform {
  const { containerWidth: cw, containerHeight: ch, videoWidth: vw, videoHeight: vh } = fit;
  if (!cw || !ch || !vw || !vh) {
    return { scale: 1, offsetX: 0, offsetY: 0, displayWidth: cw, displayHeight: ch };
  }
  const scale = Math.max(cw / vw, ch / vh);
  const displayWidth = vw * scale;
  const displayHeight = vh * scale;
  return {
    scale,
    offsetX: (cw - displayWidth) / 2,
    offsetY: (ch - displayHeight) / 2,
    displayWidth,
    displayHeight,
  };
}

/** Map one 0-1000 normalised point on the frame to container pixels. */
export function framePointToScreen(point: Point1000, fit: FrameFit): PixelPoint {
  const t = coverTransform(fit);
  const x = t.offsetX + (point.x / 1000) * t.displayWidth;
  const y = t.offsetY + (point.y / 1000) * t.displayHeight;
  return { x: fit.mirrored ? fit.containerWidth - x : x, y };
}

/** Map a 0-1000 box on the frame to a container-pixel rect (mirror-safe). */
export function frameBoxToScreen(box: Box2D, fit: FrameFit): PixelRect {
  const a = framePointToScreen({ x: box.xmin, y: box.ymin }, fit);
  const b = framePointToScreen({ x: box.xmax, y: box.ymax }, fit);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Inverse of framePointToScreen: a tap on screen to a 0-1000 frame point. */
export function screenPointToFrame(x: number, y: number, fit: FrameFit): Point1000 {
  const t = coverTransform(fit);
  const unmirroredX = fit.mirrored ? fit.containerWidth - x : x;
  const clamp = (n: number) => Math.min(1000, Math.max(0, n));
  return {
    x: clamp(((unmirroredX - t.offsetX) / t.displayWidth) * 1000),
    y: clamp(((y - t.offsetY) / t.displayHeight) * 1000),
  };
}
