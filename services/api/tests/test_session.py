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
    assert "Kese AI" in body["system_prompt"]


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


def test_elevenlabs_without_voice_id_uses_first_account_voice(
    client, auth_headers, test_settings, fakes
):
    test_settings.elevenlabs_api_key = "test-key-not-real"
    test_settings.elevenlabs_voice_id = None
    body = _post(client, auth_headers, voice_provider="elevenlabs").json()
    assert body["voice"]["provider"] == "elevenlabs"
    assert body["voice"]["elevenlabs"]["tts"]["voice_id"] == fakes["elevenlabs"].voices[0].voice_id


def test_elevenlabs_without_voice_id_and_failing_list_falls_back(
    client, auth_headers, test_settings, fakes
):
    test_settings.elevenlabs_api_key = "test-key-not-real"
    test_settings.elevenlabs_voice_id = None
    fakes["elevenlabs"].list_fail = True
    body = _post(client, auth_headers, voice_provider="elevenlabs").json()
    assert body["voice"]["provider"] == "gemini"
    assert fakes["elevenlabs"].calls == []


def test_elevenlabs_without_voice_id_and_empty_account_falls_back(
    client, auth_headers, test_settings, fakes
):
    test_settings.elevenlabs_api_key = "test-key-not-real"
    test_settings.elevenlabs_voice_id = None
    fakes["elevenlabs"].voices = []
    body = _post(client, auth_headers, voice_provider="elevenlabs").json()
    assert body["voice"]["provider"] == "gemini"


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
        config = _post(client, auth_headers, language=language, voice_provider="elevenlabs").json()[
            "live_config"
        ]
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


def test_system_prompt_tts_instruction_only_for_elevenlabs(client, auth_headers, eleven_settings):
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


# --- language "auto" ------------------------------------------------------------


def test_language_defaults_to_auto(client, auth_headers, fakes):
    body = client.post(
        "/session",
        json={"category": "general", "consent": True, "voice_provider": "gemini"},
        headers=auth_headers,
    ).json()
    assert body["voice"]["language"] == "auto"
    assert "speechConfig" not in body["live_config"]


def test_language_rejects_unknown_value(client, auth_headers):
    assert _post(client, auth_headers, language="fr").status_code == 422


def test_auto_language_elevenlabs_has_no_language_codes(client, auth_headers, eleven_settings):
    response = _post(client, auth_headers, language="auto", voice_provider="elevenlabs")
    assert response.status_code == 200
    voice = response.json()["voice"]
    assert voice["provider"] == "elevenlabs"
    assert voice["language"] == "auto"
    assert voice["elevenlabs"]["stt"]["language_code"] is None
    assert voice["elevenlabs"]["tts"]["language_code"] is None


def test_auto_language_gemini_fallback_has_no_speech_config(client, auth_headers, fakes):
    body = _post(client, auth_headers, language="auto", voice_provider="gemini").json()
    assert body["voice"] == {"provider": "gemini", "language": "auto", "elevenlabs": None}
    config = body["live_config"]
    assert config["responseModalities"] == ["AUDIO"]
    assert "speechConfig" not in config
    # VAD is still configured for audio mode.
    assert config["realtimeInputConfig"] == {
        "automaticActivityDetection": {"silenceDurationMs": 700}
    }
    assert fakes["gemini"].mint_calls[-1]["live_config"] == config


def test_auto_language_prompt(client, auth_headers):
    prompt = _post(client, auth_headers, language="auto", voice_provider="gemini").json()[
        "system_prompt"
    ]
    assert "language the user speaks" in prompt
    assert "Roman Urdu" in prompt
    assert "Urdu script" in prompt
    assert "Never switch language unless the user does" in prompt
    # Safety and refusal text is untouched.
    assert "Never give step-by-step instructions for" in prompt
    assert "stop the playbook immediately" in prompt


# --- selectable models and voice -----------------------------------------------


def test_default_models_are_returned_and_locked(client, auth_headers, fakes):
    body = _post(client, auth_headers, voice_provider="gemini").json()
    assert body["live_model"] == "gemini-3.8-live"
    assert fakes["gemini"].mint_calls[-1]["model"] == "gemini-3.8-live"


def test_unknown_live_model_is_400(client, auth_headers, fakes):
    response = _post(client, auth_headers, live_model="gemini-not-real")
    assert response.status_code == 400
    assert response.json()["detail"] == "unknown_model"
    assert fakes["gemini"].mint_calls == []


def test_unknown_tts_model_is_400(client, auth_headers, eleven_settings, fakes):
    response = _post(client, auth_headers, voice_provider="elevenlabs", tts_model="eleven_nope")
    assert response.status_code == 400
    assert response.json()["detail"] == "unknown_model"
    assert fakes["gemini"].mint_calls == []
    assert fakes["elevenlabs"].calls == []


def test_model_validation_comes_after_consent(client, auth_headers):
    response = _post(client, auth_headers, consent=False, live_model="gemini-not-real")
    assert response.status_code == 403


def test_model_pattern_is_enforced(client, auth_headers):
    assert _post(client, auth_headers, live_model="a b").status_code == 422
    assert _post(client, auth_headers, tts_model="x").status_code == 422


def test_chosen_models_are_returned_and_locked(client, auth_headers, test_settings, fakes):
    test_settings.live_model_options_extra = "gemini-alt-live"
    test_settings.tts_model_options_extra = "eleven_v3"  # duplicate of a built-in: ignored
    test_settings.elevenlabs_api_key = "test-key-not-real"
    test_settings.elevenlabs_voice_id = "voice-123"
    body = _post(
        client,
        auth_headers,
        voice_provider="elevenlabs",
        live_model="gemini-alt-live",
        tts_model="eleven_v3",
    ).json()
    assert body["live_model"] == "gemini-alt-live"
    assert fakes["gemini"].mint_calls[-1]["model"] == "gemini-alt-live"
    assert body["voice"]["elevenlabs"]["tts"]["model_id"] == "eleven_v3"


def test_default_tts_model_is_turbo(client, auth_headers, eleven_settings):
    eleven = _post(client, auth_headers, voice_provider="elevenlabs").json()["voice"]["elevenlabs"]
    assert eleven["tts"]["model_id"] == "eleven_v4_turbo"


def test_chosen_voice_is_used_when_in_account_list(client, auth_headers, eleven_settings, fakes):
    response = _post(client, auth_headers, voice_provider="elevenlabs", voice_id="voicebbbb0002")
    assert response.status_code == 200
    tts = response.json()["voice"]["elevenlabs"]["tts"]
    assert tts["voice_id"] == "voicebbbb0002"
    assert fakes["elevenlabs"].list_calls == 1


def test_no_voice_id_uses_configured_voice_without_listing(
    client, auth_headers, eleven_settings, fakes
):
    tts = _post(client, auth_headers, voice_provider="elevenlabs").json()["voice"]["elevenlabs"][
        "tts"
    ]
    assert tts["voice_id"] == "voice-123"
    assert fakes["elevenlabs"].list_calls == 0


def test_unknown_voice_is_400(client, auth_headers, eleven_settings, fakes):
    response = _post(client, auth_headers, voice_provider="elevenlabs", voice_id="notinaccount99")
    assert response.status_code == 400
    assert response.json()["detail"] == "unknown_voice"
    assert fakes["gemini"].mint_calls == []
    assert fakes["elevenlabs"].calls == []


def test_voice_id_pattern_is_enforced(client, auth_headers):
    assert _post(client, auth_headers, voice_id="short").status_code == 422
    assert _post(client, auth_headers, voice_id="has space in it").status_code == 422


def test_voice_list_failure_falls_back_to_gemini(client, auth_headers, eleven_settings, fakes):
    fakes["elevenlabs"].list_fail = True
    response = _post(client, auth_headers, voice_provider="elevenlabs", voice_id="voicebbbb0002")
    assert response.status_code == 200
    body = response.json()
    assert body["voice"]["provider"] == "gemini"
    assert body["voice"]["elevenlabs"] is None
    assert body["live_config"]["responseModalities"] == ["AUDIO"]
    assert "boom" not in response.text
    assert fakes["elevenlabs"].calls == []


def test_voice_id_ignored_for_gemini_provider(client, auth_headers, eleven_settings, fakes):
    response = _post(client, auth_headers, voice_provider="gemini", voice_id="notinaccount99")
    assert response.status_code == 200
    assert fakes["elevenlabs"].list_calls == 0
