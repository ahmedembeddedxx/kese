// Everything the live screen's canvas overlay draws: boxes/polygons for
// named parts, wire outlines from mark_wire/segment, the current step
// caption, and whether a safety gate is blocking progress. This is
// intentionally separate from sessionStore (which holds category/auth/
// playbook selection) so the overlay can be cleared/reset independently
// of the session, per the plan's `clear_highlights` tool.

import { create } from "zustand";
import type { Box2D, Point1000 } from "../lib/types";

export interface HighlightBox {
  id: string;
  label: string;
  box: Box2D;
  polygon: Point1000[] | null;
  confidence: number;
}

export interface WireOutline {
  id: string;
  polyline: Point1000[];
  color: string | null;
  label: string;
}

export interface SafetyGate {
  checkId: string;
  promptEn: string;
  promptUr: string;
  confirmLabelEn: string;
  confirmLabelUr: string;
}

interface OverlayState {
  boxes: HighlightBox[];
  wires: WireOutline[];
  captionEn: string;
  captionUr: string;
  stepIndex: number;
  stepCount: number;
  activeGate: SafetyGate | null;
  pendingWireHintEn: string | null;
  pendingWireHintUr: string | null;

  setBoxes: (boxes: HighlightBox[]) => void;
  addWire: (wire: WireOutline) => void;
  clearHighlights: () => void;
  setCaption: (en: string, ur: string) => void;
  setStepProgress: (stepIndex: number, stepCount: number) => void;
  openGate: (gate: SafetyGate) => void;
  confirmGate: () => void;
  requestWireTap: (hintEn: string, hintUr: string) => void;
  clearWireTapRequest: () => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  boxes: [],
  wires: [],
  captionEn: "",
  captionUr: "",
  stepIndex: 0,
  stepCount: 0,
  activeGate: null,
  pendingWireHintEn: null,
  pendingWireHintUr: null,

  setBoxes: (boxes) => set({ boxes }),
  addWire: (wire) => set((state) => ({ wires: [...state.wires, wire] })),
  clearHighlights: () => set({ boxes: [], wires: [] }),
  setCaption: (captionEn, captionUr) => set({ captionEn, captionUr }),
  setStepProgress: (stepIndex, stepCount) => set({ stepIndex, stepCount }),
  openGate: (gate) => set({ activeGate: gate }),
  confirmGate: () => set({ activeGate: null }),
  requestWireTap: (hintEn, hintUr) =>
    set({ pendingWireHintEn: hintEn, pendingWireHintUr: hintUr }),
  clearWireTapRequest: () => set({ pendingWireHintEn: null, pendingWireHintUr: null }),
}));
