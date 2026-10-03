import { describe, expect, it } from "vitest";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./base64";

describe("base64 round-trip", () => {
  it("recovers the original bytes", () => {
    const original = new Uint8Array([0, 1, 2, 127, 128, 255, 42]);
    const base64 = arrayBufferToBase64(original.buffer);
    const roundTripped = new Uint8Array(base64ToArrayBuffer(base64));
    expect(Array.from(roundTripped)).toEqual(Array.from(original));
  });

  it("handles an empty buffer", () => {
    const base64 = arrayBufferToBase64(new ArrayBuffer(0));
    expect(base64).toBe("");
    expect(base64ToArrayBuffer(base64).byteLength).toBe(0);
  });
});
