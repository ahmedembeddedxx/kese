// Turns a streamed LLM reply into speakable chunks for TTS. The TTS
// server buffers until ~40 characters / 8 words anyway, so we cut at
// sentence boundaries and merge short sentences up to those minimums.

const ENDER_CHARS = new Set([".", "!", "?", "۔", "؟"]); // . ! ? ۔ ؟
const URDU_COMMA = "،"; // ،
const CLOSERS = new Set(['"', "'", ")", "]", "”", "’", "»"]);

const URL_RE = /(?:https?:\/\/|www\.)\S+/giu;
const MD_LINK_RE = /\[([^\]]*)\]\([^)]*\)/gu;
const EMOJI_SEQ_RE =
  /\p{Extended_Pictographic}(?:[️⃣]|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*/gu;
const EMOJI_LEFTOVER_RE = /[️⃣]|\p{Emoji_Modifier}|\p{Regional_Indicator}/gu;
const LINE_MARKER_RE = /^\s*(?:#{1,6}\s+|>+\s?|[-*+•]\s+|\d{1,3}[.)]\s+)/u;

/** Strip markdown, URLs and emoji so the voice does not read them out. */
export function cleanForSpeech(text: string): string {
  const lines = text.split(/\r?\n/u).map((line) => {
    let out = line;
    // Repeat so "> - item" style nesting is fully removed.
    for (let i = 0; i < 3; i++) {
      const next = out.replace(LINE_MARKER_RE, "");
      if (next === out) break;
      out = next;
    }
    return out;
  });
  let out = lines.join("\n");
  out = out.replace(MD_LINK_RE, "$1");
  out = out.replace(URL_RE, " ");
  out = out.replace(EMOJI_SEQ_RE, " ").replace(EMOJI_LEFTOVER_RE, "");
  out = out.replace(/`+/gu, "").replace(/\*+/gu, "").replace(/~~/gu, "");
  out = out.replace(/__+/gu, "");
  // Lone underscores used as emphasis around a word, not inside identifiers.
  out = out.replace(/(^|\s)_+/gu, "$1").replace(/_+(?=\s|$)/gu, "");
  return out.replace(/\s+/gu, " ").trim();
}

function countWords(text: string): number {
  return text.split(/\s+/u).filter((w) => w.length > 0).length;
}

export interface SpeechChunkerOptions {
  minChars?: number;
  minWords?: number;
}

export class SpeechChunker {
  private readonly minChars: number;
  private readonly minWords: number;
  private buffer = "";

  constructor(opts: SpeechChunkerOptions = {}) {
    this.minChars = opts.minChars ?? 40;
    this.minWords = opts.minWords ?? 8;
  }

  /** Feed one streamed delta; returns any chunks that are ready to speak. */
  push(delta: string): string[] {
    this.buffer += delta;
    const chunks: string[] = [];
    for (;;) {
      const cut = this.findCut();
      if (cut < 0) break;
      const raw = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut);
      const cleaned = cleanForSpeech(raw);
      if (cleaned.length > 0) chunks.push(cleaned);
    }
    return chunks;
  }

  /** End of turn: emit whatever is left, cleaned. May be short. */
  flush(): string[] {
    const cleaned = cleanForSpeech(this.buffer);
    this.buffer = "";
    return cleaned.length > 0 ? [cleaned] : [];
  }

  reset(): void {
    this.buffer = "";
  }

  /** Index just past the first boundary whose prefix is long enough, or -1. */
  private findCut(): number {
    const buf = this.buffer;
    const allowComma = buf.length > this.minChars * 3;
    let i = 0;
    while (i < buf.length) {
      const ch = buf[i];
      let end = -1; // exclusive end of the candidate segment

      if (ch === "\n") {
        end = i + 1;
      } else if (ENDER_CHARS.has(ch)) {
        // Consume a run of enders and closing quotes: "?!", "...", '."'.
        let j = i;
        while (j + 1 < buf.length && (ENDER_CHARS.has(buf[j + 1]) || CLOSERS.has(buf[j + 1]))) j++;
        const last = buf[j];
        const atEnd = j + 1 >= buf.length;
        if (atEnd) {
          // A trailing "." could be a decimal point ("3." then "5"); wait.
          if (last !== ".") end = j + 1;
        } else if (/\s/u.test(buf[j + 1])) {
          end = j + 1;
        } else if (last !== "." && !/[\d\p{L}]/u.test(buf[j + 1])) {
          end = j + 1;
        } else if (last === "۔" || last === "؟") {
          // Urdu enders are never decimal points.
          end = j + 1;
        }
        i = j;
      } else if (ch === URDU_COMMA && allowComma) {
        end = i + 1;
      }

      if (end > 0) {
        const cleaned = cleanForSpeech(buf.slice(0, end));
        if (cleaned.length >= this.minChars && countWords(cleaned) >= this.minWords) return end;
      }
      i++;
    }
    return -1;
  }
}
