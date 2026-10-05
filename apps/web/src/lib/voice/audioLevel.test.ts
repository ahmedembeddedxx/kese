import { describe, expect, it } from "vitest";
import { LevelSmoother, pcm16Rms } from "./audioLevel";

describe("pcm16Rms", () => {
  it("returns 0 for an empty array", () => {
    expect(pcm16Rms(new Int16Array(0))).toBe(0);
  });

  it("returns 0 for silence", () => {
    expect(pcm16Rms(new Int16Array(100))).toBe(0);
  });

  it("clamps full scale to 1", () => {
    expect(pcm16Rms(new Int16Array(100).fill(32767))).toBe(1);
    expect(pcm16Rms(new Int16Array(100).fill(-32768))).toBe(1);
  });

  it("boosts quiet signals perceptually", () => {
    const quiet = new Int16Array(100).fill(1000);
    const expected = Math.sqrt(1000 / 32768) * 1.6;
    expect(pcm16Rms(quiet)).toBeCloseTo(expected, 6);
    expect(pcm16Rms(quiet)).toBeGreaterThan(1000 / 32768);
  });

  it("is monotonic in amplitude", () => {
    const a = pcm16Rms(new Int16Array(10).fill(500));
    const b = pcm16Rms(new Int16Array(10).fill(5000));
    expect(b).toBeGreaterThan(a);
  });
});

describe("LevelSmoother", () => {
  it("rises faster than it falls", () => {
    const s = new LevelSmoother();
    const up = s.next(1);
    expect(up).toBeCloseTo(0.55, 6);
    const down = s.next(0);
    expect(up - down).toBeCloseTo(up * 0.12, 6);
    expect(up).toBeGreaterThan(up - down);
  });

  it("converges toward a steady input and stays within 0..1", () => {
    const s = new LevelSmoother();
    let v = 0;
    for (let i = 0; i < 60; i++) v = s.next(0.8);
    expect(v).toBeCloseTo(0.8, 3);
    expect(s.next(5)).toBeLessThanOrEqual(1);
    expect(s.next(-5)).toBeGreaterThanOrEqual(0);
  });

  it("treats non-finite input as silence and reset returns to 0", () => {
    const s = new LevelSmoother(1, 1);
    expect(s.next(Number.NaN)).toBe(0);
    s.next(1);
    s.reset();
    expect(s.next(0)).toBe(0);
  });
});
