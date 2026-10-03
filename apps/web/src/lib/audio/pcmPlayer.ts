// Plays back the 24kHz 16-bit PCM audio chunks the Live API returns, by
// queuing each chunk as its own AudioBufferSourceNode so playback starts
// as soon as the first chunk arrives instead of waiting to buffer the
// whole response.

const PLAYBACK_SAMPLE_RATE = 24_000;

export class PcmPlayer {
  private readonly context: AudioContext;
  private nextStartTime = 0;

  constructor(context: AudioContext) {
    this.context = context;
  }

  /** Enqueue one chunk of 16-bit little-endian PCM audio for playback. */
  enqueue(pcm16: ArrayBuffer): void {
    const samples = new Int16Array(pcm16);
    const buffer = this.context.createBuffer(1, samples.length, PLAYBACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      channel[i] = samples[i] / 0x8000;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);

    const startAt = Math.max(this.nextStartTime, this.context.currentTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
  }

  /** Drop anything queued but not yet played, e.g. when the user says
   * "I'm stuck" and the agent should stop talking over itself. */
  reset(): void {
    this.nextStartTime = this.context.currentTime;
  }
}
