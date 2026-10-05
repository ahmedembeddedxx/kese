import { describe, expect, it } from "vitest";
import { derivePhase, type PhaseInputs } from "./phase";

const base: PhaseInputs = {
  connected: true,
  failed: false,
  reconnecting: false,
  agentSpeaking: false,
  awaitingReply: false,
};

describe("derivePhase", () => {
  it("is listening when nothing else is going on", () => {
    expect(derivePhase(base)).toBe("listening");
  });
  it("is connecting until connected", () => {
    expect(derivePhase({ ...base, connected: false })).toBe("connecting");
  });
  it("prefers error over everything", () => {
    expect(derivePhase({ ...base, failed: true, agentSpeaking: true })).toBe("error");
  });
  it("prefers reconnecting over speaking and thinking", () => {
    expect(derivePhase({ ...base, reconnecting: true, agentSpeaking: true })).toBe("reconnecting");
  });
  it("prefers speaking over thinking", () => {
    expect(derivePhase({ ...base, agentSpeaking: true, awaitingReply: true })).toBe("speaking");
  });
  it("is thinking while awaiting the reply", () => {
    expect(derivePhase({ ...base, awaitingReply: true })).toBe("thinking");
  });
});
