import { describe, expect, it } from "vitest";
import {
  box2dToPixelRect,
  colorForIndex,
  coverTransform,
  frameBoxToScreen,
  framePointToScreen,
  point1000ToPixel,
  polylineToPixels,
  screenPointToFrame,
  type FrameFit,
} from "./geometry";

describe("box2dToPixelRect", () => {
  it("maps a full-frame box to the full canvas", () => {
    const rect = box2dToPixelRect({ ymin: 0, xmin: 0, ymax: 1000, xmax: 1000 }, 400, 200);
    expect(rect).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  });

  it("maps a quarter box in the top-left corner", () => {
    const rect = box2dToPixelRect({ ymin: 0, xmin: 0, ymax: 500, xmax: 500 }, 400, 200);
    expect(rect).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it("maps a centered box with a nonzero origin", () => {
    const rect = box2dToPixelRect({ ymin: 250, xmin: 250, ymax: 750, xmax: 750 }, 1000, 1000);
    expect(rect).toEqual({ x: 250, y: 250, width: 500, height: 500 });
  });
});

describe("point1000ToPixel", () => {
  it("scales a point into pixel space", () => {
    expect(point1000ToPixel({ x: 500, y: 250 }, 800, 400)).toEqual({ x: 400, y: 100 });
  });
});

describe("polylineToPixels", () => {
  it("maps every point in order", () => {
    const pixels = polylineToPixels(
      [
        { x: 0, y: 0 },
        { x: 1000, y: 1000 },
      ],
      100,
      100,
    );
    expect(pixels).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("returns an empty array for an empty polyline", () => {
    expect(polylineToPixels([], 100, 100)).toEqual([]);
  });
});

describe("colorForIndex", () => {
  it("wraps around the palette for large indices", () => {
    expect(colorForIndex(0)).toBe(colorForIndex(8));
  });

  it("gives different colours for the first few indices", () => {
    const colors = new Set([colorForIndex(0), colorForIndex(1), colorForIndex(2)]);
    expect(colors.size).toBe(3);
  });
});

describe("object-fit: cover mapping", () => {
  // A 1280x720 landscape frame filling a 400x800 portrait phone: scale is
  // set by height (800/720), and the sides are cropped.
  const fit: FrameFit = {
    containerWidth: 400,
    containerHeight: 800,
    videoWidth: 1280,
    videoHeight: 720,
    mirrored: false,
  };

  it("scales by the larger ratio and centres the crop", () => {
    const t = coverTransform(fit);
    expect(t.scale).toBeCloseTo(800 / 720);
    expect(t.displayHeight).toBeCloseTo(800);
    expect(t.displayWidth).toBeCloseTo(1280 * (800 / 720));
    expect(t.offsetX).toBeCloseTo((400 - t.displayWidth) / 2);
    expect(t.offsetY).toBeCloseTo(0);
  });

  it("maps the frame centre to the screen centre", () => {
    const p = framePointToScreen({ x: 500, y: 500 }, fit);
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(400);
  });

  it("matches the plain mapping when aspect ratios agree", () => {
    const same: FrameFit = { ...fit, videoWidth: 400, videoHeight: 800 };
    const rect = frameBoxToScreen({ ymin: 100, xmin: 250, ymax: 600, xmax: 750 }, same);
    expect(rect).toEqual({ x: 100, y: 80, width: 200, height: 400 });
  });

  it("pushes cropped-out content off screen instead of squashing it", () => {
    const p = framePointToScreen({ x: 0, y: 500 }, fit);
    expect(p.x).toBeLessThan(0);
  });

  it("mirrors for a front camera and keeps the box well-formed", () => {
    const same: FrameFit = { ...fit, videoWidth: 400, videoHeight: 800, mirrored: true };
    const rect = frameBoxToScreen({ ymin: 0, xmin: 0, ymax: 500, xmax: 250 }, same);
    expect(rect.x).toBeCloseTo(300);
    expect(rect.width).toBeCloseTo(100);
    expect(rect.width).toBeGreaterThan(0);
  });

  it("round-trips a tap through the mapping, mirrored or not", () => {
    for (const mirrored of [false, true]) {
      const f = { ...fit, mirrored };
      const frame = screenPointToFrame(123, 456, f);
      const back = framePointToScreen(frame, f);
      expect(back.x).toBeCloseTo(123, 3);
      expect(back.y).toBeCloseTo(456, 3);
    }
  });

  it("falls back safely before the video has dimensions", () => {
    const t = coverTransform({ ...fit, videoWidth: 0, videoHeight: 0 });
    expect(t.scale).toBe(1);
  });
});
