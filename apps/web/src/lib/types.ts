// Shared types mirrored from services/api/app/models.py. Keep these two
// in sync by hand for now; if the API grows an OpenAPI export step later,
// generate this file from it instead (see pipelines/kb README for the
// equivalent "keep in sync by hand, for now" note on crawl schemas).

export type Category = "electrical" | "ac" | "car" | "general";

export interface Box2D {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface Point1000 {
  x: number;
  y: number;
}

export interface Detection {
  label: string;
  box_2d: Box2D;
  polygon: Point1000[] | null;
  confidence: number;
}

export interface DetectResponse {
  detections: Detection[];
  model: string;
  latency_ms: number;
}

export interface SegmentResponse {
  wire_id: string;
  polyline: Point1000[];
  suggested_color: string | null;
  model: string;
  latency_ms: number;
}

export interface SessionResponse {
  ephemeral_token: string;
  expires_at: string;
  live_model: string;
  system_prompt: string;
  playbook_id: string | null;
  tool_declarations: Record<string, unknown>[];
}

export interface KBResult {
  doc_id: string;
  title: string;
  snippet: string;
  category: Category;
  brand: string | null;
  model: string | null;
  source_url: string;
  licence: string | null;
  score: number;
}

export interface KBSearchResponse {
  query: string;
  results: KBResult[];
}

export interface Device {
  id: string;
  kind: string;
  details: Record<string, string>;
  nickname: string | null;
  saved_at: string;
}

export type EventKind =
  | "step_completed"
  | "step_failed"
  | "gate_confirmed"
  | "detect_timing"
  | "feedback"
  | "error";

export interface PlaybookStep {
  id: string;
  say: string;
  say_ur: string;
  gate: string | null;
  highlight: string[];
  read_text: boolean;
  mark_wires: boolean;
}

export interface PlaybookSummary {
  id: string;
  category: Category;
  title: string;
  title_ur: string;
  risk: "low" | "medium" | "high";
}

export interface Gate {
  en: string;
  ur: string;
  no_en: string;
  no_ur: string;
  prompt_en: string;
  prompt_ur: string;
}

export interface PlaybookDetail extends PlaybookSummary {
  summary: string;
  summary_ur: string;
  tools: string[];
  tools_ur: string[];
  steps: PlaybookStep[];
  stop_if: string[];
  stop_if_ur: string[];
}
