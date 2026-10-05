from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import AuthedUser, get_current_user
from app.config import get_settings
from app.dependencies import get_elevenlabs_client
from app.models import VoiceTokenRequest, VoiceTokenResponse
from app.rate_limit import limiter
from app.services.elevenlabs_client import ElevenLabsClient, ElevenLabsClientError

router = APIRouter()
logger = logging.getLogger(__name__)

# ElevenLabs single-use tokens expire after 15 minutes and are consumed on
# first use, so the browser fetches a fresh one on every reconnect.
_TOKEN_TTL_SECONDS = 900


@router.post("/voice/token", response_model=VoiceTokenResponse)
@limiter.limit(get_settings().voice_token_rate_limit)
def mint_voice_token(
    request: Request,
    body: VoiceTokenRequest,
    user: AuthedUser = Depends(get_current_user),
    elevenlabs: ElevenLabsClient = Depends(get_elevenlabs_client),
) -> VoiceTokenResponse:
    """Mint one fresh ElevenLabs single-use token (STT or TTS).

    Not exercised against a live ElevenLabs key.
    """
    token_type = "realtime_scribe" if body.kind == "stt" else "tts_websocket"
    try:
        token = elevenlabs.mint_single_use_token(token_type)
    except ElevenLabsClientError as exc:
        # Real cause stays in the server log; the client gets a generic message.
        logger.warning("Could not mint a %s voice token: %s", body.kind, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice is temporarily unavailable. Please try again shortly.",
        ) from exc
    return VoiceTokenResponse(token=token, ttl_seconds=_TOKEN_TTL_SECONDS)
