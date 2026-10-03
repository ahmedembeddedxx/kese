"""Thin wrapper around the `google-genai` SDK.

Every call Mend makes to Gemini goes through this one class so routers
never touch the SDK directly, which keeps them easy to test with a fake
client (see `tests/conftest.py`) and keeps the actual wire-format details
(ephemeral token shape, structured-output schema) in one place.

IMPORTANT: this module has not been exercised against a live API key yet
(see handover.md "Open Questions" -- no Gemini API key is configured in
this environment). The method bodies follow the `google-genai` SDK
surface documented in the technical plan (ephemeral tokens for Live,
structured JSON output with `box_2d`/`polygon` for detection). Before the
first real session, run `scripts/smoke_test_gemini.py` against a real key
and fix anything the live SDK disagrees with -- flag that verification in
the PR that adds the key, per AGENTS.md safety/security review rule.
"""

from __future__ import annotations

import base64
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.config import ModelConfig


@dataclass(frozen=True)
class RawDetection:
    label: str
    box_2d: tuple[float, float, float, float]  # ymin, xmin, ymax, xmax (0-1000)
    polygon: list[tuple[float, float]] | None
    confidence: float


@dataclass(frozen=True)
class EphemeralToken:
    token: str
    expires_at: datetime


class GeminiClientError(RuntimeError):
    """Raised when the Gemini API call fails or is misconfigured."""


class GeminiClient:
    """Live wrapper. Construct once per process; the SDK client is lazy."""

    def __init__(self, api_key: str | None) -> None:
        self._api_key = api_key
        self._sdk_client = None

    def _client(self):
        if not self._api_key:
            raise GeminiClientError("GEMINI_API_KEY is not configured")
        if self._sdk_client is None:
            from google import genai  # imported lazily so tests never need it installed

            self._sdk_client = genai.Client(api_key=self._api_key)
        return self._sdk_client

    def mint_ephemeral_token(
        self, *, ttl_seconds: int, system_prompt: str, tool_names: list[str]
    ) -> EphemeralToken:
        """Mint a short-lived token the browser uses to open the Live
        WebSocket directly, so the real API key never reaches the phone.
        """
        client = self._client()
        expire_time = datetime.now(UTC) + timedelta(seconds=ttl_seconds)
        token_obj = client.auth_tokens.create(
            config={
                "uses": 1,
                "expire_time": expire_time.isoformat(),
                "live_connect_constraints": {
                    "model": ModelConfig.LIVE,
                    "config": {"system_instruction": system_prompt},
                },
            }
        )
        token_value = getattr(token_obj, "name", None) or getattr(token_obj, "token", None)
        if not token_value:
            raise GeminiClientError("Gemini did not return an ephemeral token")
        return EphemeralToken(token=token_value, expires_at=expire_time)

    def detect(
        self, *, image_bytes: bytes, targets: list[str], min_confidence: float
    ) -> tuple[list[RawDetection], int]:
        """Call the fast detection model with structured JSON output.

        Returns (detections, latency_ms). Detections below `min_confidence`
        are dropped here so callers never have to think about the
        threshold twice (per the plan: "low-confidence results are not
        drawn").
        """
        client = self._client()
        started = time.monotonic()
        prompt = (
            "Find these parts in the image and return bounding boxes: "
            + ", ".join(targets)
            + ". Return box_2d as [ymin, xmin, ymax, xmax] normalized 0-1000, "
            "a tight polygon when the part has a clear outline, and your "
            "confidence from 0 to 1."
        )
        response = client.models.generate_content(
            model=ModelConfig.DETECTION,
            contents=[
                {"inline_data": {"mime_type": "image/jpeg", "data": image_bytes}},
                prompt,
            ],
            config={
                "response_mime_type": "application/json",
                "thinking_config": {"thinking_budget": 0},
            },
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        raw_items = _parse_detection_json(response.text)
        detections = [
            RawDetection(
                label=str(item["label"]),
                box_2d=tuple(item["box_2d"]),  # type: ignore[arg-type]
                polygon=[tuple(p) for p in item["polygon"]] if item.get("polygon") else None,
                confidence=float(item.get("confidence", 0.0)),
            )
            for item in raw_items
            if float(item.get("confidence", 0.0)) >= min_confidence
        ]
        return detections, latency_ms

    def embed_query(self, text: str) -> list[float]:
        client = self._client()
        result = client.models.embed_content(model=ModelConfig.EMBEDDING, contents=text)
        return list(result.embeddings[0].values)


def _parse_detection_json(raw_text: str) -> list[dict]:
    import json

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise GeminiClientError(f"Detection model returned non-JSON output: {exc}") from exc
    if isinstance(parsed, dict) and "detections" in parsed:
        parsed = parsed["detections"]
    if not isinstance(parsed, list):
        raise GeminiClientError("Detection model returned an unexpected JSON shape")
    return parsed


def encode_image_b64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("ascii")


def decode_image_b64(image_b64: str) -> bytes:
    return base64.b64decode(image_b64, validate=True)
