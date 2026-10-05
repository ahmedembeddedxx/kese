// Pure animation helpers for the overlay canvas: easing, interpolation and
// polyline maths. No canvas, no DOM, so everything here is unit tested.

import type { Box2D, Point1000 } from "../../lib/types";

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease every edge of `current` toward `target` by fraction t (0..1). */
export function lerpBox(current: Box2D, target: Box2D, t: number): Box2D {
  return {
    ymin: lerp(current.ymin, target.ymin, t),
    xmin: lerp(current.xmin, target.xmin, t),
    ymax: lerp(current.ymax, target.ymax, t),
    xmax: lerp(current.xmax, target.xmax, t),
  };
}

export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** n points (n >= 2, ends included) along a cubic Bezier curve. */
export function sampleCubic(p0: Point1000, p1: Point1000, p2: Point1000, p3: Point1000, n: number): Point1000[] {
  const count = Math.max(2, Math.floor(n));
  const out: Point1000[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push({
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    });
  }
  return out;
}

function totalLength(points: Point1000[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** The prefix of a polyline up to fractional arc length `progress` (0..1);
 * the last point is interpolated along its segment. */
export function revealPolyline(points: Point1000[], progress: number): Point1000[] {
  if (points.length === 0 || progress <= 0) return [];
  if (progress >= 1) return points.slice();
  const total = totalLength(points);
  if (points.length === 1 || total === 0) return [points[0]];
  const goal = total * progress;
  const out: Point1000[] = [points[0]];
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + seg >= goal) {
      const f = seg === 0 ? 0 : (goal - walked) / seg;
      out.push({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) });
      return out;
    }
    out.push(b);
    walked += seg;
  }
  return out;
}

/** The point at half the arc length of a polyline. */
export function polylineMidpoint(points: Point1000[]): Point1000 {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const total = totalLength(points);
  if (total === 0) return { x: points[0].x, y: points[0].y };
  const half = total / 2;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + seg >= half) {
      const f = seg === 0 ? 0 : (half - walked) / seg;
      return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
    }
    walked += seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

export function offsetPoints(points: Point1000[], dx: number, dy: number): Point1000[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}
