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


# Session resumption reconnects (a new WebSocket per resume, needed because
# audio+video Live sessions otherwise end after about 2 minutes) each consume
# one use of the ephemeral token, so a single use would break the first
# reconnect. 6 leaves headroom for a handful of resumes in one repair session
# while keeping a leaked token of little value.
EPHEMERAL_TOKEN_USES = 6

# How long the browser has to open the first connection with a fresh token.
NEW_SESSION_WINDOW_SECONDS = 120


def _camel_to_snake(name: str) -> str:
    out: list[str] = []
    for ch in name:
        if ch.isupper():
            out.append("_")
            out.append(ch.lower())
        else:
            out.append(ch)
    return "".join(out)


def _snake_keys(value):
    """Recursively convert dict keys from camelCase to snake_case.

    Only applied to `live_config`, whose keys are all fixed SDK field names.
    Never applied to tool declarations, whose parameter names are ours.
    """
    if isinstance(value, dict):
        return {_camel_to_snake(k): _snake_keys(v) for k, v in value.items()}
    return value


def build_auth_token_config(
    *,
    ttl_seconds: int,
    live_config: dict,
    tool_declarations: list[dict],
    system_prompt: str,
    now: datetime | None = None,
):
    """Build the typed `CreateAuthTokenConfig` that locks the Live config.

    Pure and network-free, so tests can validate the shape against the
    installed SDK models. Returns (config, expire_time).
    """
    from google.genai import types

    now = now or datetime.now(UTC)
    expire_time = now + timedelta(seconds=ttl_seconds)
    new_session_expire = now + timedelta(seconds=NEW_SESSION_WINDOW_SECONDS)
    constrained_config = {
        **_snake_keys(live_config),
        "system_instruction": system_prompt,
        "tools": [{"function_declarations": tool_declarations}],
    }
    auth_config = types.CreateAuthTokenConfig(
        uses=EPHEMERAL_TOKEN_USES,
        expire_time=expire_time,
        new_session_expire_time=new_session_expire,
        live_connect_constraints=types.LiveConnectConstraints(
            model=ModelConfig.LIVE,
            config=types.LiveConnectConfig(**constrained_config),
        ),
    )
    return auth_config, expire_time


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
        self,
        *,
        ttl_seconds: int,
        live_config: dict,
        tool_declarations: list[dict],
        system_prompt: str,
    ) -> EphemeralToken:
        """Mint a short-lived token the browser uses to open the Live
        WebSocket directly, so the real API key never reaches the phone.

        `live_config` is the same camelCase dict `/session` returns to the
        browser, so the config the token locks server-side and the config
        the browser sends can never drift apart. Not exercised against a
        live key (and the `v1alpha` API version some SDK releases need for
        ephemeral tokens is unverified).
        """
        client = self._client()
        auth_config, expire_time = build_auth_token_config(
            ttl_seconds=ttl_seconds,
            live_config=live_config,
            tool_declarations=tool_declarations,
            system_prompt=system_prompt,
        )
        token_obj = client.auth_tokens.create(config=auth_config)
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
