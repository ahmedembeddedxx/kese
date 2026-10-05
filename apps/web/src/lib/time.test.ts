import { describe, expect, it } from "vitest";
import { timeAgo } from "./time";

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);

describe("timeAgo", () => {
  it("formats recent times compactly", () => {
    expect(timeAgo(NOW - 10_000, NOW)).toBe("now");
    expect(timeAgo(NOW - 5 * 60_000, NOW)).toBe("5m");
    expect(timeAgo(NOW - 3 * 3_600_000, NOW)).toBe("3h");
    expect(timeAgo(NOW - 30 * 3_600_000, NOW)).toBe("Yesterday");
  });
  it("falls back to a date and never goes negative", () => {
    expect(timeAgo(NOW - 5 * 86_400_000, NOW)).toMatch(/Oct/);
    expect(timeAgo(NOW + 60_000, NOW)).toBe("now");
  });
});
