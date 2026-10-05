// What the voice pill should say right now, derived from a handful of
// booleans so the rule (and its priority order) is unit tested instead of
// being scattered across callbacks.

import type { Phase } from "../../store/liveStore";

export interface PhaseInputs {
  connected: boolean;
  failed: boolean;
  reconnecting: boolean;
  /** Agent audio is playing or the TTS stream is mid-turn. */
  agentSpeaking: boolean;
  /** The user finished a turn and the agent has not started replying. */
  awaitingReply: boolean;
}

export function derivePhase(i: PhaseInputs): Phase {
  if (i.failed) return "error";
  if (!i.connected) return "connecting";
  if (i.reconnecting) return "reconnecting";
  if (i.agentSpeaking) return "speaking";
  if (i.awaitingReply) return "thinking";
  return "listening";
}
