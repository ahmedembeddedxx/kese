// Plays streamed 16-bit mono PCM (24 kHz by default) by scheduling each
// chunk as its own AudioBufferSourceNode back to back, so playback starts
// with the first chunk. Every scheduled source is tracked together with its
// loudness so the UI can animate from getLevel() and barge-in can cut the
// audio instantly with stop().

import { pcm16Rms } from "../voice/audioLevel";

const DEFAULT_SAMPLE_RATE = 24_000;

interface TrackedChunk {
  source: AudioBufferSourceNode;
  start: number;
  end: number;
  level: number;
}

export interface PcmPlayerOptions {
  sampleRate?: number;
}

export class PcmPlayer {
  private readonly context: AudioContext;
  private readonly sampleRate: number;
  private nextStartTime = 0;
  private chunks: TrackedChunk[] = [];

  constructor(context: AudioContext, opts: PcmPlayerOptions = {}) {
    this.context = context;
    this.sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
  }

  /** Enqueue one chunk of 16-bit little-endian PCM audio for playback. */
  enqueue(pcm16: ArrayBuffer): void {
    // A trailing odd byte cannot form a sample; drop it.
    const sampleCount = Math.floor(pcm16.byteLength / 2);
    if (sampleCount === 0) return;
    const samples = new Int16Array(pcm16, 0, sampleCount);

    const buffer = this.context.createBuffer(1, sampleCount, this.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = samples[i] / 0x8000;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);

    const startAt = Math.max(this.nextStartTime, this.context.currentTime);
    const endAt = startAt + sampleCount / this.sampleRate;
    source.start(startAt);
    this.nextStartTime = endAt;
    this.chunks.push({ source, start: startAt, end: endAt, level: pcm16Rms(samples) });
  }

  /** Barge-in: silence everything scheduled, right now. */
  stop(): void {
    for (const chunk of this.chunks) {
      try {
        chunk.source.stop();
      } catch {
        // Already ended or never started; nothing to cut.
      }
    }
    this.chunks = [];
    this.nextStartTime = this.context.currentTime;
  }

  /** Alias of stop(), kept for existing callers. */
  reset(): void {
    this.stop();
  }

  isPlaying(): boolean {
    this.prune();
    return this.chunks.length > 0;
  }

  /** Loudness 0..1 of the chunk audible right now; 0 when idle. */
  getLevel(): number {
    this.prune();
    const now = this.context.currentTime;
    for (const chunk of this.chunks) {
      if (chunk.start <= now && now < chunk.end) return chunk.level;
    }
    return 0;
  }

  private prune(): void {
    const now = this.context.currentTime;
    if (this.chunks.length === 0) return;
    this.chunks = this.chunks.filter((chunk) => chunk.end > now);
  }
}
