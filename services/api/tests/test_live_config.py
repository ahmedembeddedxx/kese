"""Validates the locked Live constraints against the installed SDK models,
without any network access."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.live_tools import TOOL_DECLARATIONS, build_live_config, build_system_prompt
from app.services.gemini_client import (
    EPHEMERAL_TOKEN_USES,
    NEW_SESSION_WINDOW_SECONDS,
    build_auth_token_config,
)


@pytest.mark.parametrize("provider", ["gemini", "elevenlabs"])
@pytest.mark.parametrize("language", ["ur", "en"])
def test_constraints_validate_against_sdk_models(provider, language):
    from google.genai import types

    live_config = build_live_config(voice_provider=provider, language=language)
    now = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
    auth_config, expire_time = build_auth_token_config(
        ttl_seconds=600,
        live_config=live_config,
        tool_declarations=TOOL_DECLARATIONS,
        system_prompt="prompt",
        now=now,
    )

    assert isinstance(auth_config, types.CreateAuthTokenConfig)
    assert auth_config.uses == EPHEMERAL_TOKEN_USES == 6
    assert expire_time == auth_config.expire_time
    assert (auth_config.new_session_expire_time - now).total_seconds() == (
        NEW_SESSION_WINDOW_SECONDS
    )

    constraints = auth_config.live_connect_constraints
    assert isinstance(constraints, types.LiveConnectConstraints)
    cfg = constraints.config
    assert cfg.system_instruction == "prompt"
    assert cfg.session_resumption is not None
    assert cfg.context_window_compression.sliding_window is not None
    assert cfg.input_audio_transcription is not None
    assert cfg.output_audio_transcription is not None
    assert [m.value for m in cfg.response_modalities] == (
        ["TEXT"] if provider == "elevenlabs" else ["AUDIO"]
    )
    if provider == "gemini":
        assert cfg.speech_config.language_code == ("ur-PK" if language == "ur" else "en-US")
        assert cfg.realtime_input_config.automatic_activity_detection.silence_duration_ms == 700
    else:
        assert cfg.speech_config is None
        assert cfg.realtime_input_config is None

    declared = cfg.tools[0].function_declarations
    assert [d.name for d in declared] == [t["name"] for t in TOOL_DECLARATIONS]
    # Tool parameter names are ours and must survive untouched.
    advance = next(d for d in declared if d.name == "advance_step")
    assert "step_id" in advance.parameters.properties


def test_unknown_config_field_is_rejected_by_the_sdk():
    # Guards the test above: a wrong field name must actually fail validation.
    with pytest.raises(Exception):  # noqa: B017 - pydantic ValidationError subclass
        build_auth_token_config(
            ttl_seconds=60,
            live_config={"notARealField": {}},
            tool_declarations=[],
            system_prompt="x",
        )


def test_system_prompt_voice_provider_argument():
    eleven = build_system_prompt(
        category="general", playbook=None, language="ur", voice_provider="elevenlabs"
    )
    gemini = build_system_prompt(
        category="general", playbook=None, language="ur", voice_provider="gemini"
    )
    default = build_system_prompt(category="general", playbook=None, language="ur")
    assert "no markdown, no lists, no emojis, no URLs" in eleven
    assert "no markdown" not in gemini
    assert default == gemini
