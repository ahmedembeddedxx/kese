import { describe, expect, it } from "vitest";
import {
  easeOutCubic,
  lerp,
  lerpBox,
  offsetPoints,
  polylineMidpoint,
  revealPolyline,
  sampleCubic,
} from "./motion";

describe("lerp and easing", () => {
  it("interpolates", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it("easeOutCubic is clamped, monotonic and front-loaded", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(0.6)).toBeGreaterThan(easeOutCubic(0.4));
  });
});

describe("lerpBox", () => {
  const a = { ymin: 0, xmin: 0, ymax: 100, xmax: 100 };
  const b = { ymin: 100, xmin: 200, ymax: 300, xmax: 500 };
  it("moves every edge by t", () => {
    expect(lerpBox(a, b, 0)).toEqual(a);
    expect(lerpBox(a, b, 1)).toEqual(b);
    expect(lerpBox(a, b, 0.5)).toEqual({ ymin: 50, xmin: 100, ymax: 200, xmax: 300 });
  });
  it("does not mutate its inputs", () => {
    lerpBox(a, b, 0.5);
    expect(a.ymax).toBe(100);
  });
});

describe("sampleCubic", () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 100 };
  const p2 = { x: 100, y: 100 };
  const p3 = { x: 100, y: 0 };
  it("returns n points including both ends", () => {
    const pts = sampleCubic(p0, p1, p2, p3, 14);
    expect(pts).toHaveLength(14);
    expect(pts[0]).toEqual(p0);
    expect(pts[13].x).toBeCloseTo(100);
    expect(pts[13].y).toBeCloseTo(0);
  });
  it("never returns fewer than two points", () => {
    expect(sampleCubic(p0, p1, p2, p3, 0)).toHaveLength(2);
    expect(sampleCubic(p0, p1, p2, p3, 2)).toHaveLength(2);
  });
  it("is a straight line for collinear control points", () => {
    const pts = sampleCubic({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }, 4);
    expect(pts.map((p) => Math.round(p.x))).toEqual([0, 10, 20, 30]);
  });
});

describe("revealPolyline", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  it("handles the extremes", () => {
    expect(revealPolyline(line, 0)).toEqual([]);
    expect(revealPolyline(line, -1)).toEqual([]);
    expect(revealPolyline(line, 1)).toEqual(line);
    expect(revealPolyline(line, 2)).toEqual(line);
    expect(revealPolyline([], 0.5)).toEqual([]);
  });
  it("interpolates the last point", () => {
    expect(revealPolyline(line, 0.25)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
    expect(revealPolyline(line, 0.75)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });
  it("copes with a degenerate polyline", () => {
    expect(revealPolyline([{ x: 5, y: 5 }], 0.5)).toEqual([{ x: 5, y: 5 }]);
    expect(revealPolyline([{ x: 5, y: 5 }, { x: 5, y: 5 }], 0.5)).toEqual([{ x: 5, y: 5 }]);
  });
});

describe("polylineMidpoint", () => {
  it("finds the point at half the arc length", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(polylineMidpoint(line)).toEqual({ x: 100, y: 0 });
    expect(polylineMidpoint([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
  });
  it("handles empty and single point input", () => {
    expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 });
    expect(polylineMidpoint([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4 });
  });
});

describe("offsetPoints", () => {
  it("shifts a copy", () => {
    const pts = [{ x: 1, y: 2 }];
    const out = offsetPoints(pts, 10, -5);
    expect(out).toEqual([{ x: 11, y: -3 }]);
    expect(pts[0]).toEqual({ x: 1, y: 2 });
  });
});
