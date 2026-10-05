"""Thin wrapper around the ElevenLabs REST API, used only to mint
single-use tokens for the browser and to list the account's voices.

The browser opens the Scribe v2 Realtime STT and Text-to-Dialogue TTS
WebSockets directly, authenticated with a single-use token minted here, so
the real `xi-api-key` never reaches the phone.

Verified against the ElevenLabs docs (fetched 2026-10-05):
`POST {ELEVENLABS_API_BASE}/v1/single-use-token/{token_type}` with header
`xi-api-key`, response `{"token": "sutkn_..."}`, valid for 15 minutes and
consumed on first use.

IMPORTANT: this module has not been exercised against a live ElevenLabs key
(none is configured in this environment). In particular the `tts_websocket`
token type is the best available guess for the Text-to-Dialogue
`stream-input` endpoint (passed as the `single_use_token` query param) and
is UNVERIFIED for that endpoint. Verify it with a real key before relying
on it.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from dataclasses import dataclass
from typing import Literal

import httpx

from app.config import ModelConfig

logger = logging.getLogger(__name__)

TokenType = Literal["realtime_scribe", "tts_websocket"]

_TIMEOUT_SECONDS = 10.0

# Default voice id used in dev_fakes mode; it is one of the fake voices below
# (and matches the request pattern), so it validates like a real pick.
FAKE_VOICE_ID = "fakevoice0001"

# The account's voice list changes rarely and every /options call would
# otherwise hit ElevenLabs, so it is cached in memory per API key.
VOICES_CACHE_TTL_SECONDS = 300.0


class ElevenLabsClientError(RuntimeError):
    """Raised when minting a token fails or ElevenLabs is misconfigured.

    Messages never contain the API key.
    """


@dataclass(frozen=True)
class ElevenLabsVoice:
    voice_id: str
    name: str
    category: str | None = None
    description: str | None = None
    preview_url: str | None = None


# key hash -> (monotonic expiry, voices). Keyed by a hash so the raw API key
# is never held as a dict key that could show up in a debugger or repr.
_voices_cache: dict[str, tuple[float, list[ElevenLabsVoice]]] = {}
_voices_cache_lock = threading.Lock()


def reset_voices_cache() -> None:
    """Empty the voice list cache (used by tests)."""
    with _voices_cache_lock:
        _voices_cache.clear()


def _optional_str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


class ElevenLabsClient:
    def __init__(self, api_key: str | None) -> None:
        self._api_key = api_key

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def mint_single_use_token(self, token_type: TokenType) -> str:
        if not self._api_key:
            raise ElevenLabsClientError("ELEVENLABS_API_KEY is not configured")
        url = f"{ModelConfig.ELEVENLABS_API_BASE}/v1/single-use-token/{token_type}"
        try:
            response = httpx.post(
                url, headers={"xi-api-key": self._api_key}, timeout=_TIMEOUT_SECONDS
            )
        except httpx.HTTPError as exc:
            # Only the exception class name: the message could echo request details.
            raise ElevenLabsClientError(
                f"ElevenLabs request failed ({type(exc).__name__})"
            ) from exc
        if not response.is_success:
            raise ElevenLabsClientError(
                f"ElevenLabs returned HTTP {response.status_code} for {token_type} token"
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise ElevenLabsClientError("ElevenLabs returned a non-JSON body") from exc
        token = payload.get("token") if isinstance(payload, dict) else None
        if not isinstance(token, str) or not token:
            raise ElevenLabsClientError("ElevenLabs response did not contain a token")
        return token

    def list_voices(self) -> list[ElevenLabsVoice]:
        """The account's voices (`GET /v1/voices`), cached for 5 minutes.

        Not exercised against a live ElevenLabs key; the response mapping
        follows the documented `voices[]` fields.
        """
        if not self._api_key:
            raise ElevenLabsClientError("ELEVENLABS_API_KEY is not configured")
        cache_key = hashlib.sha256(self._api_key.encode()).hexdigest()
        now = time.monotonic()
        with _voices_cache_lock:
            cached = _voices_cache.get(cache_key)
            if cached is not None and cached[0] > now:
                return list(cached[1])

        url = f"{ModelConfig.ELEVENLABS_API_BASE}/v1/voices"
        try:
            response = httpx.get(
                url, headers={"xi-api-key": self._api_key}, timeout=_TIMEOUT_SECONDS
            )
        except httpx.HTTPError as exc:
            raise ElevenLabsClientError(
                f"ElevenLabs request failed ({type(exc).__name__})"
            ) from exc
        if not response.is_success:
            raise ElevenLabsClientError(
                f"ElevenLabs returned HTTP {response.status_code} for the voice list"
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise ElevenLabsClientError("ElevenLabs returned a non-JSON body") from exc
        raw_voices = payload.get("voices") if isinstance(payload, dict) else None
        if not isinstance(raw_voices, list):
            raise ElevenLabsClientError("ElevenLabs response did not contain a voice list")

        voices: list[ElevenLabsVoice] = []
        for item in raw_voices:
            if not isinstance(item, dict):
                continue
            voice_id = item.get("voice_id")
            name = item.get("name")
            if not isinstance(voice_id, str) or not voice_id or not isinstance(name, str):
                continue
            voices.append(
                ElevenLabsVoice(
                    voice_id=voice_id,
                    name=name,
                    category=_optional_str(item.get("category")),
                    description=_optional_str(item.get("description")),
                    preview_url=_optional_str(item.get("preview_url")),
                )
            )
        with _voices_cache_lock:
            _voices_cache[cache_key] = (now + VOICES_CACHE_TTL_SECONDS, voices)
        return list(voices)


class FakeElevenLabsClient:
    """Deterministic stand-in used when `settings.dev_fakes` is true."""

    configured = True

    def mint_single_use_token(self, token_type: TokenType) -> str:
        return "fake-stt-token" if token_type == "realtime_scribe" else "fake-tts-token"

    def list_voices(self) -> list[ElevenLabsVoice]:
        return [
            ElevenLabsVoice(
                voice_id=f"fakevoice000{n}",
                name=f"Fake voice {n}",
                category="premade",
                description=f"Deterministic fake voice number {n}.",
                preview_url=f"https://example.invalid/fakevoice000{n}.mp3",
            )
            for n in (1, 2, 3)
        ]
