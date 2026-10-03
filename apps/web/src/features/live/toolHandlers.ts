// Maps each Gemini Live tool call (see services/api/app/live_tools.py for
// the declarations sent to the model) to the matching store update and/or
// backend call. Kept as a pure-ish dispatcher, independent of the actual
// WebSocket plumbing in useLiveSession.ts, so it can be unit tested with
// a fake ApiClient and a fake frame capturer instead of a real camera.

import type { ApiClient } from "../../lib/apiClient";
import type { Gate, PlaybookDetail } from "../../lib/types";
import { useOverlayStore } from "../../store/overlayStore";

export interface ToolHandlerDeps {
  apiClient: ApiClient;
  /** Returns a base64 JPEG of the current camera frame, or null if the
   * camera isn't ready yet. */
  captureFrame: () => string | null;
  sessionId: string;
  /** The playbook currently loaded, if any (general/diagnose mode has none). */
  getPlaybook: () => PlaybookDetail | null;
  /** The bilingual gate catalogue fetched from GET /gates at session
   * start (see useLiveSession.ts) -- never duplicated as static text
   * here, so there is exactly one source of truth for safety copy. */
  getGates: () => Record<string, Gate>;
}

export type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

export function createToolDispatcher(deps: ToolHandlerDeps) {
  const overlay = useOverlayStore;

  async function highlight(args: { targets: string[]; style?: string }): Promise<ToolResult> {
    const frame = deps.captureFrame();
    if (!frame) return { ok: false, error: "camera not ready" };
    try {
      const detections = await deps.apiClient.detect({ imageB64: frame, targets: args.targets });
      overlay.getState().setBoxes(
        detections.map((d, i) => ({
          id: `${Date.now()}-${i}`,
          label: d.label,
          box: d.box_2d,
          polygon: d.polygon,
          confidence: d.confidence,
        })),
      );
      return { ok: true, count: detections.length };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  async function markWire(args: { hint: string }): Promise<ToolResult> {
    // Urdu hint text isn't modeled by the agent separately; show the same
    // hint in both languages until the Live prompt sends a bilingual pair.
    overlay.getState().requestWireTap(args.hint, args.hint);
    return { ok: true };
  }

  async function clearHighlights(): Promise<ToolResult> {
    overlay.getState().clearHighlights();
    return { ok: true };
  }

  async function advanceStep(args: { step_id: string }): Promise<ToolResult> {
    const playbook = deps.getPlaybook();
    if (!playbook) return { ok: false, error: "no playbook loaded" };
    const index = playbook.steps.findIndex((s) => s.id === args.step_id);
    if (index === -1) return { ok: false, error: `unknown step_id: ${args.step_id}` };
    const step = playbook.steps[index];
    overlay.getState().setStepProgress(index + 1, playbook.steps.length);
    overlay.getState().setCaption(step.say, step.say_ur);
    if (step.gate) {
      const gate = deps.getGates()[step.gate];
      if (gate) {
        overlay.getState().openGate({
          checkId: step.gate,
          promptEn: gate.prompt_en,
          promptUr: gate.prompt_ur,
          confirmLabelEn: gate.en,
          confirmLabelUr: gate.ur,
        });
      }
    }
    void deps.apiClient.recordEvent({
      sessionId: deps.sessionId,
      kind: "step_completed",
      playbookId: playbook.id,
      stepId: args.step_id,
    });
    return { ok: true };
  }

  async function safetyGate(args: { check_id: string }): Promise<ToolResult> {
    const gate = deps.getGates()[args.check_id];
    if (!gate) return { ok: false, error: `unknown check_id: ${args.check_id}` };
    overlay.getState().openGate({
      checkId: args.check_id,
      promptEn: gate.prompt_en,
      promptUr: gate.prompt_ur,
      confirmLabelEn: gate.en,
      confirmLabelUr: gate.ur,
    });
    return { ok: true };
  }

  async function lookupKb(args: { query: string; category?: string }): Promise<ToolResult> {
    try {
      const result = await deps.apiClient.searchKb({
        query: args.query,
        category: args.category as never,
      });
      return { ok: true, results: result.results };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  async function saveDevice(args: { kind: string; details?: Record<string, string> }): Promise<ToolResult> {
    try {
      const device = await deps.apiClient.saveDevice({ kind: args.kind, details: args.details ?? {} });
      return { ok: true, device_id: device.id };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  const handlers: Record<string, (args: never) => Promise<ToolResult>> = {
    highlight,
    mark_wire: markWire,
    clear_highlights: clearHighlights,
    advance_step: advanceStep,
    safety_gate: safetyGate,
    lookup_kb: lookupKb,
    save_device: saveDevice,
  };

  return async function dispatch(toolName: string, args: unknown): Promise<ToolResult> {
    const handler = handlers[toolName];
    if (!handler) return { ok: false, error: `unknown tool: ${toolName}` };
    return handler(args as never);
  };
}
