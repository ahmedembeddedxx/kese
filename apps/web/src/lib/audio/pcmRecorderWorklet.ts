// AudioWorkletProcessor that captures the mic and posts 16-bit PCM
// frames at the worklet's native sample rate (the backend/model side
// resamples to 16kHz is NOT done here; see note below). Runs in the
// AudioWorklet global scope, which has no DOM and isn't reachable from
// jsdom, so this file is exercised by manual testing on a real phone,
// not Vitest -- see handover.md "Open Questions".
//
// The ambient declarations below stand in for the (non-standard-lib)
// AudioWorklet types, since this file is compiled standalone via
// `new URL(..., import.meta.url)` + `audioContext.audioWorklet.addModule`
// (see geminiLiveClient.ts), not through the app's normal DOM-lib tsconfig.

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;

    const pcm16 = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const clamped = Math.max(-1, Math.min(1, channel[i]));
      pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    this.port.postMessage({ pcm16, sampleRate }, [pcm16.buffer]);
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
