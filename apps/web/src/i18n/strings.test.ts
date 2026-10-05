import { describe, expect, it } from "vitest";
import { STRINGS, translate } from "./strings";

describe("strings", () => {
  it("has no empty values", () => {
    for (const [key, value] of Object.entries(STRINGS)) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("interpolates variables", () => {
    expect(translate("stepOf", { n: 2, total: 5 })).toBe("Step 2 of 5");
  });

  it("contains no em dashes and no Arabic-script text (UI is English only)", () => {
    for (const value of Object.values(STRINGS)) {
      expect(value).not.toContain("—");
      expect(/[؀-ۿ]/.test(value)).toBe(false);
    }
  });
});
