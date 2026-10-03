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
