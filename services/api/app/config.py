"""Single source of truth for model IDs, prices and quotas.

Per decisions.md D-005: never hardcode a Gemini/Replicate model string or
a price anywhere else in the codebase. When a model is renamed or a price
changes, this is the only file that needs to change.

Prices are USD, taken from the Gemini API pricing page as cited in the
Mend technical plan (Oct 3, 2026). The Flash-Lite rates are introductory
and are scheduled to rise on 1 January 2027 per that page -- re-check
before relying on them past that date.
"""

from __future__ import annotations

import re
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_MODEL_ID_RE = re.compile(r"[A-Za-z0-9._-]{3,80}")


class ModelConfig:
    """Model identifiers used across the backend and the browser client."""

    LIVE = "gemini-3.8-live"
    DETECTION = "gemini-3.1-flash-lite"
    EMBEDDING = "gemini-embedding-001"
    SEGMENTATION_FALLBACK = "meta/sam-2"  # Replicate model slug, confirm before first real use

    # ElevenLabs voice stack (Urdu ears and mouth). Not exercised against a
    # live key yet. `eleven_flash_v2_5` and `eleven_multilingual_v2` do NOT
    # support Urdu, so they must never be used for Urdu sessions.
    ELEVENLABS_STT = "scribe_v2_realtime"
    ELEVENLABS_TTS = "eleven_v4_turbo"
    ELEVENLABS_API_BASE = "https://api.elevenlabs.io"
    ELEVENLABS_STT_WS_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
    ELEVENLABS_TTS_WS_URL = "wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input"
    ELEVENLABS_STT_LANGUAGE_UR = "urd"
    ELEVENLABS_STT_LANGUAGE_EN = "eng"
    ELEVENLABS_OUTPUT_FORMAT = "pcm_24000"

    # Models the user may pick in the settings sheet. Only ids we can
    # verify are listed here; the team can append more via the
    # MEND_LIVE_MODEL_OPTIONS_EXTRA / MEND_TTS_MODEL_OPTIONS_EXTRA env vars
    # (see `Settings`) without a code change. The first entry of each list
    # is the default. Every TTS option must support Urdu.
    LIVE_MODEL_OPTIONS: list[dict[str, str]] = [
        {"id": LIVE, "label": "Default"},
    ]
    TTS_MODEL_OPTIONS: list[dict[str, str]] = [
        {"id": ELEVENLABS_TTS, "label": "Turbo (fastest)"},
        {"id": "eleven_v3", "label": "v3 (most expressive)"},
    ]


class PricingConfig:
    """USD prices, used for cost estimation and budget-alert logging only.

    These are not billing authority -- the Google Cloud and Replicate
    consoles are. This is used to estimate `/events` cost logs so we can
    compare against the real bill (see technical plan, "Watch real usage,
    not estimates").
    """

    LIVE_AUDIO_IN_PER_MINUTE = 0.005
    LIVE_VIDEO_IN_PER_MINUTE = 0.002
    LIVE_AUDIO_OUT_PER_MINUTE = 0.018

    DETECTION_INPUT_PER_1M_TOKENS = 0.25
    DETECTION_OUTPUT_PER_1M_TOKENS = 1.50

    # Replicate SAM fallback cost varies by model/run time; this is the
    # documented range from the plan, used only as a rough estimate.
    SEGMENTATION_FALLBACK_LOW = 0.001
    SEGMENTATION_FALLBACK_HIGH = 0.015

    TYPICAL_SESSION_USD = 0.17
    WORST_CASE_SESSION_USD = 0.22
    DEFAULT_BUDGET_ALERT_USD = 20.0


class Settings(BaseSettings):
    """Runtime configuration, loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="MEND_", extra="ignore")

    environment: str = Field(default="development")  # development | test | production

    gemini_api_key: str | None = Field(default=None)
    replicate_api_token: str | None = Field(default=None)

    # ElevenLabs (Scribe v2 Realtime STT + eleven_v4_turbo TTS). When either
    # is unset, /session silently falls back to Gemini native audio.
    elevenlabs_api_key: str | None = Field(default=None)
    elevenlabs_voice_id: str | None = Field(default=None)

    # Deterministic in-process stand-ins for Gemini, Replicate and
    # ElevenLabs, so the whole stack runs without any API keys. Refused in
    # production (see `dev_fakes_allowed` and `check_dev_fakes`).
    dev_fakes: bool = Field(default=False)

    firebase_project_id: str | None = Field(default=None)
    firestore_emulator_host: str | None = Field(default=None)

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # Safety limits (see AGENTS.md security review rule).
    max_upload_bytes: int = Field(default=2_000_000)  # 2 MB, comfortably above a 1024px JPEG
    detect_rate_limit: str = Field(default="20/minute")
    session_rate_limit: str = Field(default="10/minute")
    segment_rate_limit: str = Field(default="20/minute")
    voice_token_rate_limit: str = Field(default="30/minute")
    options_rate_limit: str = Field(default="30/minute")

    # Comma separated model ids appended to the selectable model lists
    # (label = id), so models can be added by env without a code change.
    live_model_options_extra: str = Field(default="")
    tts_model_options_extra: str = Field(default="")

    ephemeral_token_ttl_seconds: int = Field(default=600)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def dev_auth_allowed(self) -> bool:
        """Whether the `dev:<uid>` bearer-token bypass is allowed.

        Only ever true outside production, and only used so the stack can
        be exercised end-to-end in Docker Compose / CI without a real
        Firebase project. See decisions.md D-006.
        """
        return self.environment in {"development", "test"}

    @property
    def dev_fakes_allowed(self) -> bool:
        """Whether `dev_fakes` may be enabled. Never true in production,
        same philosophy as `dev_auth_allowed` (decisions.md D-006)."""
        return not self.is_production

    @model_validator(mode="after")
    def check_dev_fakes(self) -> Settings:
        """Fail loudly at startup if fakes are switched on in production."""
        if self.dev_fakes and not self.dev_fakes_allowed:
            raise ValueError("MEND_DEV_FAKES must not be enabled when MEND_ENVIRONMENT=production")
        return self


def _with_extras(base: list[dict[str, str]], extra: str) -> list[dict[str, str]]:
    """`base` plus the comma separated ids in `extra` (label = id).

    Ids that do not match the request pattern, or that are already listed,
    are skipped, so a typo in the env var cannot break /options.
    """
    options = [dict(option) for option in base]
    seen = {option["id"] for option in options}
    for raw in extra.split(","):
        model_id = raw.strip()
        if model_id and model_id not in seen and _MODEL_ID_RE.fullmatch(model_id):
            options.append({"id": model_id, "label": model_id})
            seen.add(model_id)
    return options


def live_model_options(settings: Settings) -> list[dict[str, str]]:
    return _with_extras(ModelConfig.LIVE_MODEL_OPTIONS, settings.live_model_options_extra)


def tts_model_options(settings: Settings) -> list[dict[str, str]]:
    return _with_extras(ModelConfig.TTS_MODEL_OPTIONS, settings.tts_model_options_extra)


@lru_cache
def get_settings() -> Settings:
    return Settings()
