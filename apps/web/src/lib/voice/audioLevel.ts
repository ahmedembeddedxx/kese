// Loudness helpers that drive the "orb" animation from raw PCM.

/**
 * RMS of a 16-bit PCM block mapped to 0..1 with a perceptual boost, so
 * quiet speech still moves the visual. Empty input is silence.
 */
export function pcm16Rms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSquares += s * s;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const level = Math.sqrt(rms / 32768) * 1.6;
  return Math.min(1, Math.max(0, level));
}

/** Asymmetric one-pole smoother: rises quickly, falls slowly. */
export class LevelSmoother {
  private readonly attack: number;
  private readonly release: number;
  private value = 0;

  constructor(attack = 0.55, release = 0.12) {
    this.attack = attack;
    this.release = release;
  }

  next(raw: number): number {
    const target = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
    const coeff = target > this.value ? this.attack : this.release;
    this.value += (target - this.value) * coeff;
    this.value = Math.min(1, Math.max(0, this.value));
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}
