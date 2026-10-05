import { describe, expect, it } from "vitest";
import { SpeechChunker, cleanForSpeech } from "./sentenceChunker";

describe("cleanForSpeech", () => {
  it("strips markdown emphasis, code and headings", () => {
    expect(cleanForSpeech("## **Turn off** the `breaker` __now__")).toBe("Turn off the breaker now");
  });

  it("strips bullets, numbering and quotes at line start", () => {
    expect(cleanForSpeech("- first\n* second\n1. third\n2) fourth\n> quoted")).toBe(
      "first second third fourth quoted",
    );
  });

  it("keeps digits that are not list markers", () => {
    expect(cleanForSpeech("Set it to 3.5 volts")).toBe("Set it to 3.5 volts");
  });

  it("removes urls and keeps link text", () => {
    expect(cleanForSpeech("See https://example.com/a?b=1 and [the guide](https://x.y/z) ok")).toBe(
      "See and the guide ok",
    );
  });

  it("removes emoji and pictographs", () => {
    expect(cleanForSpeech("Done ✅ great \u{1F44D}\u{1F3FD} \u{1F468}‍\u{1F527} go")).toBe(
      "Done great go",
    );
  });

  it("keeps Urdu text and punctuation, collapsing whitespace", () => {
    const input = "  آپ   پہلے\n\nپنکھا بند کریں۔  کیا ہوا؟ ہاں، ٹھیک ہے۔ ";
    expect(cleanForSpeech(input)).toBe("آپ پہلے پنکھا بند کریں۔ کیا ہوا؟ ہاں، ٹھیک ہے۔");
  });

  it("keeps the zero width non joiner used in Urdu", () => {
    expect(cleanForSpeech("ہوا‌ہے")).toBe("ہوا‌ہے");
  });

  it("leaves snake_case identifiers alone", () => {
    expect(cleanForSpeech("use main_switch here")).toBe("use main_switch here");
  });

  it("returns an empty string for pure decoration", () => {
    expect(cleanForSpeech("\u{1F600} ** `` ")).toBe("");
  });
});

describe("SpeechChunker", () => {
  it("buffers short sentences until the minimums are met", () => {
    const c = new SpeechChunker();
    expect(c.push("Turn it off. ")).toEqual([]);
    expect(c.push("Then wait a moment. ")).toEqual([]);
    const out = c.push("Check the wire carefully before touching it. ");
    expect(out).toEqual([
      "Turn it off. Then wait a moment. Check the wire carefully before touching it.",
    ]);
  });

  it("splits long sentences at each ender and keeps the partial tail buffered", () => {
    const c = new SpeechChunker({ minChars: 10, minWords: 2 });
    const out = c.push("First sentence here. Second one there! Third is partial");
    expect(out).toEqual(["First sentence here.", "Second one there!"]);
    expect(c.flush()).toEqual(["Third is partial"]);
    expect(c.flush()).toEqual([]);
  });

  it("works across arbitrary delta boundaries", () => {
    const c = new SpeechChunker({ minChars: 10, minWords: 2 });
    const text = "Open the panel now. Look at the red wire.";
    const out: string[] = [];
    for (const ch of text) out.push(...c.push(ch));
    out.push(...c.flush());
    expect(out).toEqual(["Open the panel now.", "Look at the red wire."]);
  });

  it("does not split decimals", () => {
    const c = new SpeechChunker({ minChars: 5, minWords: 1 });
    const out: string[] = [];
    for (const ch of "Measure 3.5 volts across it. ") out.push(...c.push(ch));
    expect(out).toEqual(["Measure 3.5 volts across it."]);
  });

  it("chunks the Urdu example sentence pair correctly", () => {
    const c = new SpeechChunker();
    const text = "آپ پہلے پنکھا بند کریں۔ پھر بریکر بھی بند کریں۔";
    // The first sentence alone is too short, so it merges with the second.
    expect(c.push(text)).toEqual([text]);
  });

  it("splits Urdu sentences once each is long enough", () => {
    const c = new SpeechChunker({ minChars: 15, minWords: 3 });
    const out = c.push("آپ پہلے پنکھا بند کریں۔ پھر بریکر بھی بند کریں۔");
    expect(out).toEqual(["آپ پہلے پنکھا بند کریں۔", "پھر بریکر بھی بند کریں۔"]);
  });

  it("splits at the Urdu question mark", () => {
    const c = new SpeechChunker({ minChars: 10, minWords: 2 });
    expect(c.push("کیا پنکھا بند ہے؟ ہاں")).toEqual(["کیا پنکھا بند ہے؟"]);
  });

  it("splits on newlines", () => {
    const c = new SpeechChunker({ minChars: 5, minWords: 2 });
    expect(c.push("- step one done\n- step two")).toEqual(["step one done"]);
    expect(c.flush()).toEqual(["step two"]);
  });

  it("uses the Urdu comma only when the buffer is long", () => {
    const short = new SpeechChunker({ minChars: 10, minWords: 2 });
    expect(short.push("ہاں جی ٹھیک ہے، اب آگے بڑھیں")).toEqual([]);

    const long = new SpeechChunker({ minChars: 10, minWords: 2 });
    const out = long.push("یہ ایک بہت لمبا جملہ ہے جس میں بہت سے الفاظ ہیں، اب آگے بڑھیں");
    expect(out).toEqual(["یہ ایک بہت لمبا جملہ ہے جس میں بہت سے الفاظ ہیں،"]);
  });

  it("never emits a chunk below the minimums from push", () => {
    const c = new SpeechChunker();
    const out = c.push("Yes. No. Maybe. Okay then. Fine. ");
    for (const chunk of out) {
      expect(chunk.length).toBeGreaterThanOrEqual(40);
    }
    expect(out).toEqual([]);
  });

  it("strips markdown and emoji from emitted chunks", () => {
    const c = new SpeechChunker({ minChars: 10, minWords: 2 });
    const out = c.push("**Great job** \u{1F389} you are done. ");
    expect(out).toEqual(["Great job you are done."]);
  });

  it("drops segments that clean to nothing", () => {
    const c = new SpeechChunker({ minChars: 1, minWords: 1 });
    expect(c.push("\u{1F600}\n")).toEqual([]);
    expect(c.flush()).toEqual([]);
  });

  it("reset discards the buffer", () => {
    const c = new SpeechChunker();
    c.push("half a sentence");
    c.reset();
    expect(c.flush()).toEqual([]);
  });
});
