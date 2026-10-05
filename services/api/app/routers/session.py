from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import AuthedUser, get_current_user
from app.config import ModelConfig, Settings, get_settings
from app.dependencies import get_elevenlabs_client, get_gemini_client
from app.live_tools import TOOL_DECLARATIONS, build_live_config, build_system_prompt
from app.models import (
    ElevenLabsSession,
    ElevenLabsSTTSession,
    ElevenLabsTTSSession,
    SessionRequest,
    SessionResponse,
    SessionVoice,
)
from app.playbooks import PlaybookNotFoundError, get_playbook_registry
from app.rate_limit import limiter
from app.services.elevenlabs_client import ElevenLabsClient, ElevenLabsClientError
from app.services.gemini_client import GeminiClient, GeminiClientError

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/session", response_model=SessionResponse)
@limiter.limit(get_settings().session_rate_limit)
def create_session(
    request: Request,
    body: SessionRequest,
    user: AuthedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    gemini: GeminiClient = Depends(get_gemini_client),
    elevenlabs: ElevenLabsClient = Depends(get_elevenlabs_client),
) -> SessionResponse:
    # Consent comes first, before any lookup or token minting.
    if not body.consent:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="consent_required")

    registry = get_playbook_registry()
    playbook = None
    if body.playbook_id:
        try:
            playbook = registry.get(body.playbook_id)
        except PlaybookNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown playbook_id: {body.playbook_id}",
            ) from exc
        if playbook["category"] != body.category:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="playbook_id does not belong to the given category",
            )

    language = "ur" if body.language == "ur" else "en"
    voice = _resolve_voice(
        requested=body.voice_provider,
        language=language,
        settings=settings,
        elevenlabs=elevenlabs,
    )

    system_prompt = build_system_prompt(
        category=body.category,
        playbook=playbook,
        language=body.language,
        voice_provider=voice.provider,
    )
    live_config = build_live_config(voice_provider=voice.provider, language=language)

    try:
        token = gemini.mint_ephemeral_token(
            ttl_seconds=settings.ephemeral_token_ttl_seconds,
            system_prompt=system_prompt,
            live_config=live_config,
            tool_declarations=TOOL_DECLARATIONS,
        )
    except GeminiClientError as exc:
        # Log the real cause server-side; never echo internal exception
        # text (which can reveal configuration state) back to the client.
        logger.warning("Could not start a Live session: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not start a Live session right now. Please try again shortly.",
        ) from exc

    return SessionResponse(
        ephemeral_token=token.token,
        expires_at=token.expires_at,
        live_model=_live_model_name(),
        system_prompt=system_prompt,
        playbook_id=playbook["id"] if playbook else None,
        tool_declarations=TOOL_DECLARATIONS,
        voice=voice,
        live_config=live_config,
    )


def _resolve_voice(
    *,
    requested: str,
    language: str,
    settings: Settings,
    elevenlabs: ElevenLabsClient,
) -> SessionVoice:
    """Resolve the ACTIVE voice provider server-side.

    ElevenLabs is used only if it was requested AND both the API key and
    voice id are configured AND both tokens mint successfully. Otherwise we
    silently fall back to Gemini native audio (logged), because the user
    must never be left without a voice. Not exercised against a live key.
    """
    fallback = SessionVoice(provider="gemini", language=language)
    if requested != "elevenlabs":
        return fallback

    voice_id = settings.elevenlabs_voice_id or ("fake-voice-id" if settings.dev_fakes else None)
    if not voice_id or not (settings.dev_fakes or settings.elevenlabs_api_key):
        logger.warning("ElevenLabs not configured (key or voice id missing); using Gemini audio")
        return fallback

    try:
        stt_token = elevenlabs.mint_single_use_token("realtime_scribe")
        tts_token = elevenlabs.mint_single_use_token("tts_websocket")
    except ElevenLabsClientError as exc:
        logger.warning("Could not mint ElevenLabs tokens, using Gemini audio: %s", exc)
        return fallback

    stt_language = (
        ModelConfig.ELEVENLABS_STT_LANGUAGE_UR
        if language == "ur"
        else ModelConfig.ELEVENLABS_STT_LANGUAGE_EN
    )
    return SessionVoice(
        provider="elevenlabs",
        language=language,
        elevenlabs=ElevenLabsSession(
            stt=ElevenLabsSTTSession(
                url=ModelConfig.ELEVENLABS_STT_WS_URL,
                token=stt_token,
                model_id=ModelConfig.ELEVENLABS_STT,
                language_code=stt_language,
                audio_format="pcm_16000",
                commit_strategy="vad",
                vad_silence_threshold_secs=0.8,
            ),
            tts=ElevenLabsTTSSession(
                url=ModelConfig.ELEVENLABS_TTS_WS_URL,
                token=tts_token,
                model_id=ModelConfig.ELEVENLABS_TTS,
                voice_id=voice_id,
                output_format=ModelConfig.ELEVENLABS_OUTPUT_FORMAT,
                language_code=language,
            ),
            token_ttl_seconds=900,
        ),
    )


def _live_model_name() -> str:
    from app.config import ModelConfig

    return ModelConfig.LIVE
