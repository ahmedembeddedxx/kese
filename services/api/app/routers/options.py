from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request

from app.auth import AuthedUser, get_current_user
from app.config import (
    ModelConfig,
    Settings,
    get_settings,
    live_model_options,
    tts_model_options,
)
from app.dependencies import get_elevenlabs_client
from app.models import ModelOption, OptionsDefaults, OptionsResponse, VoiceOption
from app.rate_limit import limiter
from app.services.elevenlabs_client import (
    FAKE_VOICE_ID,
    ElevenLabsClient,
    ElevenLabsClientError,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/options", response_model=OptionsResponse)
@limiter.limit(get_settings().options_rate_limit)
def get_options(
    request: Request,
    user: AuthedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    elevenlabs: ElevenLabsClient = Depends(get_elevenlabs_client),
) -> OptionsResponse:
    """What the settings sheet can offer: voices, models and the defaults.

    If ElevenLabs is not configured or the voice list cannot be fetched, the
    voice list is empty and `elevenlabs_available` is false. The failure is
    logged, never echoed to the client. Not exercised against a live key.
    """
    voices: list[VoiceOption] = []
    available = False
    try:
        voices = [
            VoiceOption(
                voice_id=v.voice_id,
                name=v.name,
                category=v.category,
                description=v.description,
                preview_url=v.preview_url,
            )
            for v in elevenlabs.list_voices()
        ]
        available = True
    except ElevenLabsClientError as exc:
        logger.warning("Could not list ElevenLabs voices for /options: %s", exc)

    live_models = [ModelOption(**o) for o in live_model_options(settings)]
    tts_models = [ModelOption(**o) for o in tts_model_options(settings)]
    default_voice_id = settings.elevenlabs_voice_id or (
        FAKE_VOICE_ID if settings.dev_fakes else None
    )
    return OptionsResponse(
        voices=voices,
        live_models=live_models,
        tts_models=tts_models,
        defaults=OptionsDefaults(
            voice_id=default_voice_id,
            live_model=ModelConfig.LIVE,
            tts_model=ModelConfig.ELEVENLABS_TTS,
            voice_provider="elevenlabs" if available else "gemini",
        ),
        elevenlabs_available=available,
    )
