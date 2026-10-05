import { describe, expect, it, vi } from "vitest";
import { PcmPlayer } from "./pcmPlayer";

class FakeSource {
  buffer: FakeBuffer | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeBuffer {
  readonly length: number;
  readonly sampleRate: number;
  readonly data: Float32Array;

  constructor(length: number, sampleRate: number) {
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = new Float32Array(length);
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = { kind: "destination" };
  sources: FakeSource[] = [];
  buffers: FakeBuffer[] = [];
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => {
    const b = new FakeBuffer(length, sampleRate);
    this.buffers.push(b);
    return b;
  });
  createBufferSource = vi.fn(() => {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  });
}

function make(opts?: { sampleRate?: number }) {
  const ctx = new FakeAudioContext();
  const player = new PcmPlayer(ctx as unknown as AudioContext, opts);
  return { ctx, player };
}

function pcm(samples: number[]): ArrayBuffer {
  return new Int16Array(samples).buffer;
}

describe("PcmPlayer", () => {
  it("is idle before anything is enqueued", () => {
    const { player } = make();
    expect(player.isPlaying()).toBe(false);
    expect(player.getLevel()).toBe(0);
  });

  it("converts samples to floats and connects to the destination", () => {
    const { ctx, player } = make();
    player.enqueue(pcm([0, 16384, -32768]));
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 3, 24000);
    expect(Array.from(ctx.buffers[0].data)).toEqual([0, 0.5, -1]);
    expect(ctx.sources[0].connect).toHaveBeenCalledWith(ctx.destination);
    expect(ctx.sources[0].start).toHaveBeenCalledWith(0);
  });

  it("schedules consecutive chunks back to back", () => {
    const { ctx, player } = make({ sampleRate: 1000 });
    player.enqueue(pcm(new Array(500).fill(100))); // 0.5s
    player.enqueue(pcm(new Array(250).fill(100))); // 0.25s
    player.enqueue(pcm(new Array(100).fill(100)));
    expect(ctx.sources[0].start).toHaveBeenCalledWith(0);
    expect(ctx.sources[1].start).toHaveBeenCalledWith(0.5);
    expect(ctx.sources[2].start).toHaveBeenCalledWith(0.75);
  });

  it("restarts from currentTime after the schedule has run dry", () => {
    const { ctx, player } = make({ sampleRate: 1000 });
    player.enqueue(pcm(new Array(100).fill(1)));
    ctx.currentTime = 5;
    player.enqueue(pcm(new Array(100).fill(1)));
    expect(ctx.sources[1].start).toHaveBeenCalledWith(5);
  });

  it("handles odd-length buffers by dropping the trailing byte", () => {
    const { ctx, player } = make();
    const odd = new Uint8Array([1, 0, 2, 0, 9]).buffer;
    expect(() => player.enqueue(odd)).not.toThrow();
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 2, 24000);
    expect(Array.from(ctx.buffers[0].data)).toEqual([1 / 32768, 2 / 32768]);
  });

  it("ignores empty and single-byte chunks", () => {
    const { ctx, player } = make();
    player.enqueue(new ArrayBuffer(0));
    player.enqueue(new ArrayBuffer(1));
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    expect(player.isPlaying()).toBe(false);
  });

  it("reports playing until the last chunk ends", () => {
    const { ctx, player } = make({ sampleRate: 1000 });
    player.enqueue(pcm(new Array(500).fill(1000)));
    expect(player.isPlaying()).toBe(true);
    ctx.currentTime = 0.4;
    expect(player.isPlaying()).toBe(true);
    ctx.currentTime = 0.5;
    expect(player.isPlaying()).toBe(false);
  });

  it("returns the level of the chunk playing right now and prunes finished ones", () => {
    const { ctx, player } = make({ sampleRate: 1000 });
    player.enqueue(pcm(new Array(500).fill(2000))); // 0..0.5 quiet
    player.enqueue(pcm(new Array(500).fill(8000))); // 0.5..1.0 loud
    const quiet = Math.sqrt(2000 / 32768) * 1.6;
    const loud = Math.sqrt(8000 / 32768) * 1.6;

    ctx.currentTime = 0.1;
    expect(player.getLevel()).toBeCloseTo(quiet, 6);
    ctx.currentTime = 0.6;
    expect(player.getLevel()).toBeCloseTo(loud, 6);
    ctx.currentTime = 1.2;
    expect(player.getLevel()).toBe(0);
    expect(player.isPlaying()).toBe(false);
  });

  it("returns 0 while the next chunk has not started yet", () => {
    const { ctx, player } = make({ sampleRate: 1000 });
    ctx.currentTime = 0;
    player.enqueue(pcm(new Array(100).fill(5000)));
    ctx.currentTime = 2;
    player.enqueue(pcm(new Array(100).fill(5000)));
    ctx.currentTime = 1;
    expect(player.getLevel()).toBe(0);
  });

  it("stop() halts every source, clears tracking and resets the cursor", () => {
    const { ctx, player } = make({ sampleRate: 1000 });
    player.enqueue(pcm(new Array(500).fill(1000)));
    player.enqueue(pcm(new Array(500).fill(1000)));
    ctx.currentTime = 0.2;
    player.stop();
    expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(ctx.sources[1].stop).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(false);
    expect(player.getLevel()).toBe(0);
    player.enqueue(pcm(new Array(100).fill(1000)));
    expect(ctx.sources[2].start).toHaveBeenCalledWith(0.2);
  });

  it("stop() tolerates sources that throw and a second call", () => {
    const { ctx, player } = make();
    player.enqueue(pcm([1, 2, 3]));
    ctx.sources[0].stop.mockImplementation(() => {
      throw new Error("InvalidStateError");
    });
    expect(() => player.stop()).not.toThrow();
    expect(() => player.stop()).not.toThrow();
  });

  it("reset() behaves like stop()", () => {
    const { ctx, player } = make();
    player.enqueue(pcm([1, 2, 3]));
    player.reset();
    expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(false);
  });
});
