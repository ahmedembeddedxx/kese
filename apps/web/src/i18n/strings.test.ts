import { describe, expect, it } from "vitest";
import { STRINGS, translate } from "./strings";

describe("strings", () => {
  it("has the same keys in both languages with no empty values", () => {
    expect(Object.keys(STRINGS.ur).sort()).toEqual(Object.keys(STRINGS.en).sort());
    for (const lang of ["en", "ur"] as const) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe("");
      }
    }
  });

  it("interpolates variables", () => {
    expect(translate("en", "stepOf", { n: 2, total: 5 })).toBe("Step 2 of 5");
    expect(translate("ur", "stepOf", { n: 2, total: 5 })).toContain("2");
  });

  it("contains no em dashes", () => {
    for (const lang of ["en", "ur"] as const) {
      for (const value of Object.values(STRINGS[lang])) expect(value).not.toContain("—");
    }
  });

  it("keeps placeholders consistent across languages", () => {
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      const enVars = (STRINGS.en[key].match(/\{\w+\}/g) ?? []).sort();
      const urVars = (STRINGS.ur[key].match(/\{\w+\}/g) ?? []).sort();
      expect(urVars, key).toEqual(enVars);
    }
  });
});
