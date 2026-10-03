import { describe, expect, it } from "vitest";
import { box2dToPixelRect, colorForIndex, point1000ToPixel, polylineToPixels } from "./geometry";

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
