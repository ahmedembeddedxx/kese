from __future__ import annotations


def _post(client, headers, **overrides):
    body = {"category": "general", "language": "en", "consent": True, **overrides}
    return client.post("/session", json=body, headers=headers)


def test_create_session_general_mode(client, auth_headers):
    response = _post(client, auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["ephemeral_token"] == "fake-ephemeral-token"
    assert body["playbook_id"] is None
    assert "Mend" in body["system_prompt"]


def test_create_session_with_playbook(client, auth_headers):
    response = _post(
        client, auth_headers, category="electrical", playbook_id="fan-capacitor-replace"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["playbook_id"] == "fan-capacitor-replace"
    assert "fan-capacitor-replace" in body["system_prompt"]


def test_create_session_unknown_playbook_is_404(client, auth_headers):
    response = _post(client, auth_headers, category="electrical", playbook_id="does-not-exist")
    assert response.status_code == 404


def test_create_session_playbook_category_mismatch_is_400(client, auth_headers):
    response = _post(client, auth_headers, category="ac", playbook_id="fan-capacitor-replace")
    assert response.status_code == 400


def test_create_session_rejects_bad_category(client, auth_headers):
    response = _post(client, auth_headers, category="plumbing")
    assert response.status_code == 422


def test_create_session_rejects_bad_voice_provider(client, auth_headers):
    response = _post(client, auth_headers, voice_provider="siri")
    assert response.status_code == 422


def test_create_session_requires_auth(client):
    response = client.post("/session", json={"category": "general", "consent": True})
    assert response.status_code == 401


def test_create_session_gemini_failure_is_503(client, auth_headers, fakes):
    fakes["gemini"].fail = True
    response = _post(client, auth_headers)
    assert response.status_code == 503
    assert "boom" not in response.text


# --- consent -----------------------------------------------------------------


def test_consent_missing_is_403(client, auth_headers, fakes):
    response = client.post("/session", json={"category": "general"}, headers=auth_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "consent_required"
    assert fakes["gemini"].mint_calls == []


def test_consent_false_is_403_before_anything_else(client, auth_headers, fakes):
    # An unknown playbook would be a 404 and a broken Gemini a 503; consent wins.
    fakes["gemini"].fail = True
    response = _post(client, auth_headers, consent=False, playbook_id="does-not-exist")
    assert response.status_code == 403
    assert response.json()["detail"] == "consent_required"
    assert fakes["gemini"].mint_calls == []
    assert fakes["elevenlabs"].calls == []


def test_consent_true_is_200(client, auth_headers):
    assert _post(client, auth_headers, consent=True).status_code == 200


# --- voice provider resolution -----------------------------------------------


def test_elevenlabs_requested_without_key_falls_back_to_gemini(client, auth_headers, fakes):
    response = _post(client, auth_headers, voice_provider="elevenlabs")
    assert response.status_code == 200
    body = response.json()
    assert body["voice"] == {"provider": "gemini", "language": "en", "elevenlabs": None}
    assert body["live_config"]["responseModalities"] == ["AUDIO"]
    assert fakes["elevenlabs"].calls == []


def test_elevenlabs_requested_without_voice_id_falls_back(
    client, auth_headers, test_settings, fakes
):
    test_settings.elevenlabs_api_key = "test-key-not-real"
    test_settings.elevenlabs_voice_id = None
    body = _post(client, auth_headers, voice_provider="elevenlabs").json()
    assert body["voice"]["provider"] == "gemini"
    assert fakes["elevenlabs"].calls == []


def test_elevenlabs_without_api_key_but_with_voice_id_falls_back(
    client, auth_headers, test_settings
):
    test_settings.elevenlabs_voice_id = "voice-123"
    body = _post(client, auth_headers, voice_provider="elevenlabs").json()
    assert body["voice"]["provider"] == "gemini"


def test_elevenlabs_mint_failure_falls_back_silently(client, auth_headers, eleven_settings, fakes):
    fakes["elevenlabs"].fail = True
    response = _post(client, auth_headers, voice_provider="elevenlabs")
    assert response.status_code == 200
    body = response.json()
    assert body["voice"]["provider"] == "gemini"
    assert body["voice"]["elevenlabs"] is None
    assert body["live_config"]["responseModalities"] == ["AUDIO"]
    assert "boom" not in response.text
    # The token Gemini locked must match the fallback config.
    assert fakes["gemini"].mint_calls[-1]["live_config"] == body["live_config"]


def test_gemini_requested_never_touches_elevenlabs(client, auth_headers, eleven_settings, fakes):
    body = _post(client, auth_headers, voice_provider="gemini").json()
    assert body["voice"]["provider"] == "gemini"
    assert fakes["elevenlabs"].calls == []


def test_elevenlabs_happy_path_urdu(client, auth_headers, eleven_settings, fakes):
    response = _post(client, auth_headers, language="ur", voice_provider="elevenlabs")
    assert response.status_code == 200
    voice = response.json()["voice"]
    assert voice["provider"] == "elevenlabs"
    assert voice["language"] == "ur"
    eleven = voice["elevenlabs"]
    assert eleven["token_ttl_seconds"] == 900
    assert eleven["stt"] == {
        "url": "wss://api.elevenlabs.io/v1/speech-to-text/realtime",
        "token": "fake-realtime_scribe-token",
        "model_id": "scribe_v2_realtime",
        "language_code": "urd",
        "audio_format": "pcm_16000",
        "commit_strategy": "vad",
        "vad_silence_threshold_secs": 0.8,
    }
    assert eleven["tts"] == {
        "url": "wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input",
        "token": "fake-tts_websocket-token",
        "model_id": "eleven_v4_turbo",
        "voice_id": "voice-123",
        "output_format": "pcm_24000",
        "language_code": "ur",
    }
    assert fakes["elevenlabs"].calls == ["realtime_scribe", "tts_websocket"]
    # The API key itself must never appear in the response.
    assert "test-key-not-real" not in response.text


def test_elevenlabs_happy_path_english_language_codes(client, auth_headers, eleven_settings):
    eleven = _post(client, auth_headers, voice_provider="elevenlabs").json()["voice"]["elevenlabs"]
    assert eleven["stt"]["language_code"] == "eng"
    assert eleven["tts"]["language_code"] == "en"


def test_voice_provider_defaults_to_elevenlabs(client, auth_headers, eleven_settings):
    # No voice_provider in the body at all.
    body = _post(client, auth_headers).json()
    assert body["voice"]["provider"] == "elevenlabs"


# --- live_config ---------------------------------------------------------------

_COMMON = {
    "inputAudioTranscription": {},
    "outputAudioTranscription": {},
    "sessionResumption": {},
    "contextWindowCompression": {"slidingWindow": {}},
}


def test_live_config_elevenlabs_is_text_mode(client, auth_headers, eleven_settings):
    for language in ("ur", "en"):
        config = _post(
            client, auth_headers, language=language, voice_provider="elevenlabs"
        ).json()["live_config"]
        assert config == {**_COMMON, "responseModalities": ["TEXT"]}


def test_live_config_gemini_urdu(client, auth_headers):
    config = _post(client, auth_headers, language="ur", voice_provider="gemini").json()[
        "live_config"
    ]
    assert config == {
        **_COMMON,
        "responseModalities": ["AUDIO"],
        "realtimeInputConfig": {"automaticActivityDetection": {"silenceDurationMs": 700}},
        "speechConfig": {"languageCode": "ur-PK"},
    }


def test_live_config_gemini_english(client, auth_headers):
    config = _post(client, auth_headers, language="en", voice_provider="gemini").json()[
        "live_config"
    ]
    assert config["responseModalities"] == ["AUDIO"]
    assert config["speechConfig"] == {"languageCode": "en-US"}
    assert config["realtimeInputConfig"] == {
        "automaticActivityDetection": {"silenceDurationMs": 700}
    }


def test_token_is_minted_with_same_config_as_returned(client, auth_headers, fakes):
    body = _post(client, auth_headers, language="ur", voice_provider="gemini").json()
    call = fakes["gemini"].mint_calls[-1]
    assert call["live_config"] == body["live_config"]
    assert call["tool_declarations"] == body["tool_declarations"]
    assert call["system_prompt"] == body["system_prompt"]


# --- system prompt by provider ---------------------------------------------------


def test_system_prompt_tts_instruction_only_for_elevenlabs(
    client, auth_headers, eleven_settings
):
    eleven = _post(client, auth_headers, voice_provider="elevenlabs").json()["system_prompt"]
    gemini = _post(client, auth_headers, voice_provider="gemini").json()["system_prompt"]
    assert "read aloud by a text-to-speech engine" in eleven
    assert "read aloud by a text-to-speech engine" not in gemini
    # Shared lines are present for both.
    for prompt in (eleven, gemini):
        assert "highlight" in prompt
        assert "no on-screen Repeat" in prompt
        assert "Never give step-by-step instructions for" in prompt


def test_system_prompt_urdu_script_and_brevity(client, auth_headers):
    prompt = _post(client, auth_headers, language="ur", voice_provider="gemini").json()[
        "system_prompt"
    ]
    assert "Urdu script" in prompt
    assert "brief" in prompt
