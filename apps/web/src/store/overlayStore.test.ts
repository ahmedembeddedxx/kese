import { beforeEach, describe, expect, it } from "vitest";
import { useOverlayStore } from "./overlayStore";

const initialState = useOverlayStore.getState();

beforeEach(() => {
  useOverlayStore.setState(initialState, true);
});

describe("overlayStore", () => {
  it("starts empty", () => {
    const state = useOverlayStore.getState();
    expect(state.boxes).toEqual([]);
    expect(state.wires).toEqual([]);
    expect(state.activeGate).toBeNull();
  });

  it("setBoxes replaces the box list", () => {
    useOverlayStore.getState().setBoxes([
      {
        id: "b1",
        label: "fan capacitor",
        box: { ymin: 0, xmin: 0, ymax: 100, xmax: 100 },
        polygon: null,
        confidence: 0.9,
      },
    ]);
    expect(useOverlayStore.getState().boxes).toHaveLength(1);
  });

  it("addWire appends without dropping existing wires", () => {
    useOverlayStore.getState().addWire({ id: "w1", polyline: [], color: "brown", label: "W1" });
    useOverlayStore.getState().addWire({ id: "w2", polyline: [], color: "blue", label: "W2" });
    expect(useOverlayStore.getState().wires.map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("clearHighlights empties both boxes and wires", () => {
    useOverlayStore.getState().setBoxes([
      { id: "b1", label: "x", box: { ymin: 0, xmin: 0, ymax: 1, xmax: 1 }, polygon: null, confidence: 1 },
    ]);
    useOverlayStore.getState().addWire({ id: "w1", polyline: [], color: null, label: "W1" });
    useOverlayStore.getState().clearHighlights();
    expect(useOverlayStore.getState().boxes).toEqual([]);
    expect(useOverlayStore.getState().wires).toEqual([]);
  });

  it("openGate and confirmGate toggle the active gate", () => {
    const gate = {
      checkId: "power_off_confirmed",
      promptEn: "Breaker is off",
      promptUr: "بریکر بند ہے",
      confirmLabelEn: "Breaker is off",
      confirmLabelUr: "بریکر بند ہے",
    };
    useOverlayStore.getState().openGate(gate);
    expect(useOverlayStore.getState().activeGate).toEqual(gate);
    useOverlayStore.getState().confirmGate();
    expect(useOverlayStore.getState().activeGate).toBeNull();
  });

  it("setStepProgress and setCaption update independently of overlays", () => {
    useOverlayStore.getState().setStepProgress(3, 7);
    useOverlayStore.getState().setCaption("Discharge the capacitor", "کپیسیٹر ڈسچارج کریں");
    const state = useOverlayStore.getState();
    expect(state.stepIndex).toBe(3);
    expect(state.stepCount).toBe(7);
    expect(state.captionEn).toBe("Discharge the capacitor");
    expect(state.captionUr).toBe("کپیسیٹر ڈسچارج کریں");
  });
});
