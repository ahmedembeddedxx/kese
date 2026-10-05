// Thin wrapper around the backend's own endpoints (services/api). Every
// call here is a small JSON request, never raw frames or audio -- those
// go straight from the browser to Gemini Live (see
// src/features/live/useLiveSession.ts), per the plan's "no media relay"
// architecture.

import type {
  Category,
  Detection,
  DetectResponse,
  Device,
  EventKind,
  Gate,
  KBSearchResponse,
  PlaybookDetail,
  PlaybookSummary,
  SegmentResponse,
  SessionResponse,
  VoiceProvider,
  VoiceTokenResponse,
} from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getAuthToken: () => string | null;
}

export class ApiClient {
  private readonly options: ApiClientOptions;

  constructor(options: ApiClientOptions) {
    this.options = options;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | number | undefined> } = {},
  ): Promise<T> {
    const token = this.options.getAuthToken();
    if (!token) {
      throw new ApiError("Not signed in", 401);
    }

    const url = new URL(path, this.options.baseUrl);
    if (init.query) {
      for (const [key, value] of Object.entries(init.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      throw new ApiError(body.detail ?? `Request to ${path} failed`, response.status);
    }
    if (response.status === 202 || response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  createSession(args: {
    category: Category;
    playbookId?: string;
    language?: "en" | "ur";
    deviceHint?: string;
    voiceProvider?: VoiceProvider;
    /** Must be true: the server refuses to start a session without consent. */
    consent: boolean;
  }): Promise<SessionResponse> {
    return this.request<SessionResponse>("/session", {
      method: "POST",
      body: JSON.stringify({
        category: args.category,
        playbook_id: args.playbookId,
        language: args.language ?? "en",
        device_hint: args.deviceHint,
        voice_provider: args.voiceProvider ?? "elevenlabs",
        consent: args.consent,
      }),
    });
  }

  /** Fresh single-use ElevenLabs token (they are consumed on connect). */
  mintVoiceToken(kind: "stt" | "tts"): Promise<string> {
    return this.request<VoiceTokenResponse>("/voice/token", {
      method: "POST",
      body: JSON.stringify({ kind }),
    }).then((r) => r.token);
  }

  detect(args: {
    imageB64: string;
    targets: string[];
    playbookStepId?: string;
    minConfidence?: number;
  }): Promise<Detection[]> {
    return this.request<DetectResponse>("/detect", {
      method: "POST",
      body: JSON.stringify({
        image_b64: args.imageB64,
        targets: args.targets,
        playbook_step_id: args.playbookStepId,
        min_confidence: args.minConfidence ?? 0.5,
      }),
    }).then((r) => r.detections);
  }

  segment(args: { imageB64: string; point: { x: number; y: number }; hint?: string }) {
    return this.request<SegmentResponse>("/segment", {
      method: "POST",
      body: JSON.stringify({ image_b64: args.imageB64, point: args.point, hint: args.hint }),
    });
  }

  searchKb(args: { query: string; category?: Category; limit?: number }): Promise<KBSearchResponse> {
    return this.request<KBSearchResponse>("/kb/search", {
      method: "GET",
      query: { q: args.query, category: args.category, limit: args.limit },
    });
  }

  listDevices(): Promise<Device[]> {
    return this.request<{ devices: Device[] }>("/devices").then((r) => r.devices);
  }

  saveDevice(args: { kind: string; details: Record<string, string>; nickname?: string }) {
    return this.request<Device>("/devices", {
      method: "POST",
      body: JSON.stringify(args),
    });
  }

  listPlaybooks(category?: Category): Promise<PlaybookSummary[]> {
    return this.request<{ playbooks: PlaybookSummary[] }>("/playbooks", {
      query: { category },
    }).then((r) => r.playbooks);
  }

  getPlaybook(playbookId: string): Promise<PlaybookDetail> {
    return this.request<PlaybookDetail>(`/playbooks/${encodeURIComponent(playbookId)}`);
  }

  getGates(): Promise<Record<string, Gate>> {
    return this.request<{ gates: Record<string, Gate> }>("/gates").then((r) => r.gates);
  }

  recordEvent(args: {
    sessionId: string;
    kind: EventKind;
    playbookId?: string;
    stepId?: string;
    detail?: Record<string, string | number | boolean>;
  }): Promise<void> {
    return this.request<void>("/events", {
      method: "POST",
      body: JSON.stringify({
        session_id: args.sessionId,
        kind: args.kind,
        playbook_id: args.playbookId,
        step_id: args.stepId,
        detail: args.detail ?? {},
      }),
    });
  }
}
