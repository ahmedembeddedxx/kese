"""Thin wrapper around the ElevenLabs REST API, used only to mint
single-use tokens for the browser.

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

import logging
from typing import Literal

import httpx

from app.config import ModelConfig

logger = logging.getLogger(__name__)

TokenType = Literal["realtime_scribe", "tts_websocket"]

_TIMEOUT_SECONDS = 10.0


class ElevenLabsClientError(RuntimeError):
    """Raised when minting a token fails or ElevenLabs is misconfigured.

    Messages never contain the API key.
    """


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


class FakeElevenLabsClient:
    """Deterministic stand-in used when `settings.dev_fakes` is true."""

    configured = True

    def mint_single_use_token(self, token_type: TokenType) -> str:
        return "fake-stt-token" if token_type == "realtime_scribe" else "fake-tts-token"
