// API stand-in for demo mode (VITE_MOCK_LIVE=1): serves a small playbook
// list and accepts feedback/save-device calls locally, so every screen can
// be clicked through with no backend. Never used outside demo builds.

import { ApiClient } from "./apiClient";
import type { Device, PlaybookSummary } from "./types";

const DEMO_PLAYBOOKS: PlaybookSummary[] = [
  { id: "fan-capacitor-replace", category: "electrical", title: "Replace a fan capacitor", title_ur: "پنکھے کا کیپیسیٹر بدلیں", risk: "high" },
  { id: "socket-replace", category: "electrical", title: "Replace a wall socket", title_ur: "دیوار کا ساکٹ بدلیں", risk: "high" },
  { id: "switch-replace", category: "electrical", title: "Replace a light switch", title_ur: "لائٹ کا سوئچ بدلیں", risk: "medium" },
  { id: "ac-filter-clean", category: "ac", title: "Clean the AC filter", title_ur: "اے سی کا فلٹر صاف کریں", risk: "low" },
  { id: "ac-not-cooling", category: "ac", title: "AC is not cooling", title_ur: "اے سی ٹھنڈا نہیں کر رہا", risk: "medium" },
  { id: "car-battery-jump", category: "car", title: "Jump-start a car battery", title_ur: "گاڑی کی بیٹری جمپ اسٹارٹ کریں", risk: "medium" },
  { id: "car-oil-check", category: "car", title: "Check the engine oil", title_ur: "انجن آئل چیک کریں", risk: "low" },
];

export class MockApiClient extends ApiClient {
  override async listPlaybooks(): Promise<PlaybookSummary[]> {
    return DEMO_PLAYBOOKS;
  }

  override async saveDevice(args: { kind: string; details: Record<string, string>; nickname?: string }): Promise<Device> {
    return { id: "demo", kind: args.kind, details: args.details, nickname: args.nickname ?? null, saved_at: new Date().toISOString() };
  }

  override async recordEvent(): Promise<void> {}
}
