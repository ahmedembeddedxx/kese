"""Pydantic request/response schemas for every endpoint.

Every field here is deliberately validated (bounded strings, enums,
normalized coordinate ranges) per AGENTS.md's "validate every request body
with Pydantic" rule, not just typed.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

Category = Annotated[str, Field(pattern="^(electrical|ac|car|general)$")]

# Normalized 0-1000 coordinate, as returned by Gemini box_2d / polygon per the plan.
Coord1000 = Annotated[float, Field(ge=0, le=1000)]


class Box2D(BaseModel):
    """[ymin, xmin, ymax, xmax], normalized 0-1000, as Gemini returns it."""

    ymin: Coord1000
    xmin: Coord1000
    ymax: Coord1000
    xmax: Coord1000

    @field_validator("ymax")
    @classmethod
    def y_order(cls, v: float, info) -> float:
        ymin = info.data.get("ymin")
        if ymin is not None and v < ymin:
            raise ValueError("ymax must be >= ymin")
        return v

    @field_validator("xmax")
    @classmethod
    def x_order(cls, v: float, info) -> float:
        xmin = info.data.get("xmin")
        if xmin is not None and v < xmin:
            raise ValueError("xmax must be >= xmin")
        return v


class Point1000(BaseModel):
    x: Coord1000
    y: Coord1000


# ---------------------------------------------------------------------------
# POST /session
# ---------------------------------------------------------------------------


class SessionRequest(BaseModel):
    category: Category
    device_hint: str | None = Field(default=None, max_length=200)
    playbook_id: str | None = Field(default=None, pattern="^[a-z0-9]+(-[a-z0-9]+)*$")
    language: str = Field(default="en", pattern="^(en|ur)$")
    # Which voice stack the client would like. The server resolves the
    # ACTIVE provider and may fall back to "gemini" (see SessionResponse.voice).
    voice_provider: Literal["gemini", "elevenlabs"] = "elevenlabs"
    # Disclaimer and consent on first use is a safety feature from the plan.
    consent: bool = False


class ElevenLabsSTTSession(BaseModel):
    url: str
    token: str
    model_id: str
    language_code: str
    audio_format: str
    commit_strategy: str
    vad_silence_threshold_secs: float


class ElevenLabsTTSSession(BaseModel):
    url: str
    token: str
    model_id: str
    voice_id: str
    output_format: str
    language_code: str


class ElevenLabsSession(BaseModel):
    stt: ElevenLabsSTTSession
    tts: ElevenLabsTTSSession
    token_ttl_seconds: int = 900


class SessionVoice(BaseModel):
    provider: Literal["gemini", "elevenlabs"]
    language: Literal["ur", "en"]
    elevenlabs: ElevenLabsSession | None = None


class SessionResponse(BaseModel):
    ephemeral_token: str
    expires_at: datetime
    live_model: str
    system_prompt: str
    playbook_id: str | None = None
    # Sent so the frontend declares the same tools to the Live SDK at
    # connect time that the ephemeral token was minted with, from the one
    # place they're defined (app/live_tools.py), never duplicated as a
    # second hardcoded copy in TypeScript.
    tool_declarations: list[dict]
    # The resolved voice stack. `voice.provider` is authoritative: it may
    # differ from the requested one after a server-side fallback.
    voice: SessionVoice
    # camelCase Live connect config, locked identically into the token.
    live_config: dict


# ---------------------------------------------------------------------------
# POST /voice/token
#
# Single-use ElevenLabs tokens are consumed on connect, so the browser needs
# a fresh one on every reconnect.
# ---------------------------------------------------------------------------


class VoiceTokenRequest(BaseModel):
    kind: Literal["stt", "tts"]


class VoiceTokenResponse(BaseModel):
    token: str
    ttl_seconds: int


# ---------------------------------------------------------------------------
# POST /detect
# ---------------------------------------------------------------------------


class DetectRequest(BaseModel):
    image_b64: str = Field(min_length=1)
    targets: list[str] = Field(min_length=1, max_length=8)
    playbook_step_id: str | None = Field(default=None, max_length=32)
    min_confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    @field_validator("targets")
    @classmethod
    def targets_not_blank(cls, v: list[str]) -> list[str]:
        cleaned = [t.strip() for t in v if t.strip()]
        if not cleaned:
            raise ValueError("targets must contain at least one non-blank label")
        return cleaned


class Detection(BaseModel):
    label: str
    box_2d: Box2D
    polygon: list[Point1000] | None = None
    confidence: float = Field(ge=0.0, le=1.0)


class DetectResponse(BaseModel):
    detections: list[Detection]
    model: str
    latency_ms: int


# ---------------------------------------------------------------------------
# POST /segment
# ---------------------------------------------------------------------------


class SegmentRequest(BaseModel):
    image_b64: str = Field(min_length=1)
    point: Point1000
    hint: str | None = Field(default=None, max_length=120)


class SegmentResponse(BaseModel):
    wire_id: str
    polyline: list[Point1000] = Field(min_length=2)
    suggested_color: str | None = None
    model: str
    latency_ms: int


# ---------------------------------------------------------------------------
# GET /kb/search
# ---------------------------------------------------------------------------


class KBResult(BaseModel):
    doc_id: str
    title: str
    snippet: str
    category: Category
    brand: str | None = None
    model: str | None = None
    source_url: str
    licence: str | None = None
    score: float = Field(ge=0.0, le=1.0)


class KBSearchResponse(BaseModel):
    query: str
    results: list[KBResult]


# ---------------------------------------------------------------------------
# POST /devices, GET /devices
# ---------------------------------------------------------------------------


class DeviceKind(StrEnum):
    fan = "fan"
    ac = "ac"
    car = "car"
    switch = "switch"
    socket = "socket"


class DeviceCreateRequest(BaseModel):
    kind: DeviceKind
    details: dict[str, str] = Field(default_factory=dict, max_length=20)
    nickname: str | None = Field(default=None, max_length=60)

    @field_validator("details")
    @classmethod
    def bounded_detail_values(cls, v: dict[str, str]) -> dict[str, str]:
        for key, value in v.items():
            if len(key) > 60 or len(value) > 200:
                raise ValueError("device detail keys/values are too long")
        return v


class Device(BaseModel):
    id: str
    kind: DeviceKind
    details: dict[str, str]
    nickname: str | None = None
    saved_at: datetime


class DeviceListResponse(BaseModel):
    devices: list[Device]


# ---------------------------------------------------------------------------
# POST /events
# ---------------------------------------------------------------------------


class EventKind(StrEnum):
    step_completed = "step_completed"
    step_failed = "step_failed"
    gate_confirmed = "gate_confirmed"
    detect_timing = "detect_timing"
    feedback = "feedback"
    error = "error"


class EventRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    playbook_id: str | None = Field(default=None, max_length=64)
    step_id: str | None = Field(default=None, max_length=32)
    kind: EventKind
    detail: dict[str, str | int | float | bool] = Field(default_factory=dict, max_length=20)
    client_ts: datetime | None = None


class EventResponse(BaseModel):
    accepted: bool = True
    server_ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# GET /playbooks, GET /playbooks/{id}
#
# Exposes the same playbook data the Live system prompt is built from
# (app/live_tools.py), so the frontend's step-progress UI ("Step 3 of 7")
# reads real data instead of duplicating it -- anything the agent can act
# on, the app can also display. See AGENTS.md "customer-first, n-to-n
# access".
# ---------------------------------------------------------------------------


class PlaybookStep(BaseModel):
    id: str
    say: str
    say_ur: str
    gate: str | None = None
    highlight: list[str] = Field(default_factory=list)
    read_text: bool = False
    mark_wires: bool = False


class PlaybookSummary(BaseModel):
    id: str
    category: Category
    title: str
    title_ur: str
    risk: str


class PlaybookDetail(PlaybookSummary):
    summary: str
    summary_ur: str
    tools: list[str]
    tools_ur: list[str]
    steps: list[PlaybookStep]
    stop_if: list[str]
    stop_if_ur: list[str]


class PlaybookListResponse(BaseModel):
    playbooks: list[PlaybookSummary]


# ---------------------------------------------------------------------------
# GET /gates
#
# The shared, bilingual safety-gate catalogue (playbooks/gates.json) is
# served from here instead of duplicated as a second copy in the frontend,
# so safety-critical copy has exactly one source of truth.
# ---------------------------------------------------------------------------


class Gate(BaseModel):
    en: str
    ur: str
    no_en: str
    no_ur: str
    prompt_en: str
    prompt_ur: str


class GatesResponse(BaseModel):
    gates: dict[str, Gate]
