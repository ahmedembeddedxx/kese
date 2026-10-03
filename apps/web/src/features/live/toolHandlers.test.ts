import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../lib/apiClient";
import type { Gate, PlaybookDetail } from "../../lib/types";
import { useOverlayStore } from "../../store/overlayStore";
import { createToolDispatcher } from "./toolHandlers";

const PLAYBOOK: PlaybookDetail = {
  id: "fan-capacitor-replace",
  category: "electrical",
  title: "Replace the capacitor",
  title_ur: "کپیسیٹر تبدیل کریں",
  risk: "medium",
  summary: "",
  summary_ur: "",
  tools: [],
  tools_ur: [],
  stop_if: [],
  stop_if_ur: [],
  steps: [
    { id: "s1", say: "Switch off the breaker.", say_ur: "بریکر بند کریں۔", gate: "power_off_confirmed", highlight: ["MCB"], read_text: false, mark_wires: false },
    { id: "s2", say: "Open the canopy.", say_ur: "کینوپی کھولیں۔", gate: null, highlight: [], read_text: false, mark_wires: false },
  ],
};

const GATES: Record<string, Gate> = {
  power_off_confirmed: {
    en: "Breaker is off",
    ur: "بریکر بند ہے",
    no_en: "Not yet",
    no_ur: "ابھی نہیں",
    prompt_en: "Switch off the breaker.",
    prompt_ur: "بریکر بند کریں۔",
  },
};

const initialOverlayState = useOverlayStore.getState();

beforeEach(() => {
  useOverlayStore.setState(initialOverlayState, true);
});

function makeDispatcher(overrides: Partial<ApiClient> = {}, playbook: PlaybookDetail | null = PLAYBOOK) {
  const apiClient = {
    detect: vi.fn().mockResolvedValue([]),
    searchKb: vi.fn().mockResolvedValue({ query: "", results: [] }),
    saveDevice: vi.fn().mockResolvedValue({ id: "dev-1" }),
    recordEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ApiClient;

  return {
    apiClient,
    dispatch: createToolDispatcher({
      apiClient,
      captureFrame: () => "fake-base64-jpeg",
      sessionId: "sess-1",
      getPlaybook: () => playbook,
      getGates: () => GATES,
    }),
  };
}

describe("highlight", () => {
  it("detects and stores boxes", async () => {
    const detections = [
      { label: "fan capacitor", box_2d: { ymin: 0, xmin: 0, ymax: 100, xmax: 100 }, polygon: null, confidence: 0.9 },
    ];
    const { dispatch } = makeDispatcher({ detect: vi.fn().mockResolvedValue(detections) });
    const result = await dispatch("highlight", { targets: ["fan capacitor"] });
    expect(result).toEqual({ ok: true, count: 1 });
    expect(useOverlayStore.getState().boxes).toHaveLength(1);
    expect(useOverlayStore.getState().boxes[0].label).toBe("fan capacitor");
  });

  it("fails cleanly when the camera isn't ready", async () => {
    const { dispatch } = makeDispatcher();
    const dispatcherNoCamera = createToolDispatcher({
      apiClient: { detect: vi.fn() } as unknown as ApiClient,
      captureFrame: () => null,
      sessionId: "sess-1",
      getPlaybook: () => PLAYBOOK,
      getGates: () => GATES,
    });
    const result = await dispatcherNoCamera("highlight", { targets: ["x"] });
    expect(result).toEqual({ ok: false, error: "camera not ready" });
    void dispatch;
  });
});

describe("mark_wire", () => {
  it("sets the pending wire tap hint", async () => {
    const { dispatch } = makeDispatcher();
    await dispatch("mark_wire", { hint: "Tap the left wire" });
    expect(useOverlayStore.getState().pendingWireHintEn).toBe("Tap the left wire");
  });
});

describe("clear_highlights", () => {
  it("empties boxes and wires", async () => {
    useOverlayStore.getState().setBoxes([
      { id: "b1", label: "x", box: { ymin: 0, xmin: 0, ymax: 1, xmax: 1 }, polygon: null, confidence: 1 },
    ]);
    const { dispatch } = makeDispatcher();
    await dispatch("clear_highlights", {});
    expect(useOverlayStore.getState().boxes).toEqual([]);
  });
});

describe("advance_step", () => {
  it("updates caption, step progress, and opens the gate for a gated step", async () => {
    const { dispatch, apiClient } = makeDispatcher();
    const result = await dispatch("advance_step", { step_id: "s1" });
    expect(result).toEqual({ ok: true });
    const state = useOverlayStore.getState();
    expect(state.captionEn).toBe("Switch off the breaker.");
    expect(state.stepIndex).toBe(1);
    expect(state.stepCount).toBe(2);
    expect(state.activeGate?.checkId).toBe("power_off_confirmed");
    expect(apiClient.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "s1", kind: "step_completed" }),
    );
  });

  it("does not open a gate for an ungated step", async () => {
    const { dispatch } = makeDispatcher();
    await dispatch("advance_step", { step_id: "s2" });
    expect(useOverlayStore.getState().activeGate).toBeNull();
  });

  it("fails cleanly with no playbook loaded", async () => {
    const { dispatch } = makeDispatcher({}, null);
    const result = await dispatch("advance_step", { step_id: "s1" });
    expect(result).toEqual({ ok: false, error: "no playbook loaded" });
  });

  it("fails cleanly for an unknown step id", async () => {
    const { dispatch } = makeDispatcher();
    const result = await dispatch("advance_step", { step_id: "does-not-exist" });
    expect(result).toEqual({ ok: false, error: "unknown step_id: does-not-exist" });
  });
});

describe("safety_gate", () => {
  it("opens the named gate directly", async () => {
    const { dispatch } = makeDispatcher();
    await dispatch("safety_gate", { check_id: "power_off_confirmed" });
    expect(useOverlayStore.getState().activeGate?.promptEn).toBe("Switch off the breaker.");
  });

  it("fails cleanly for an unknown gate id", async () => {
    const { dispatch } = makeDispatcher();
    const result = await dispatch("safety_gate", { check_id: "not-a-gate" });
    expect(result).toEqual({ ok: false, error: "unknown check_id: not-a-gate" });
  });
});

describe("lookup_kb and save_device", () => {
  it("returns KB results from the API client", async () => {
    const results = [{ doc_id: "d1" }];
    const { dispatch } = makeDispatcher({
      searchKb: vi.fn().mockResolvedValue({ query: "q", results }),
    });
    const result = await dispatch("lookup_kb", { query: "capacitor rating" });
    expect(result).toEqual({ ok: true, results });
  });

  it("saves a device and returns its id", async () => {
    const { dispatch } = makeDispatcher();
    const result = await dispatch("save_device", { kind: "fan", details: {} });
    expect(result).toEqual({ ok: true, device_id: "dev-1" });
  });
});

describe("unknown tool", () => {
  it("fails cleanly instead of throwing", async () => {
    const { dispatch } = makeDispatcher();
    const result = await dispatch("not_a_real_tool", {});
    expect(result).toEqual({ ok: false, error: "unknown tool: not_a_real_tool" });
  });
});
