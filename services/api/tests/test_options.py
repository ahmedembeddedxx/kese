from __future__ import annotations

from app.dependencies import get_elevenlabs_client
from app.services.elevenlabs_client import ElevenLabsClient


def test_options_happy_path(client, auth_headers, eleven_settings):
    response = client.get("/options", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {
        "voices": [
            {
                "voice_id": "voiceaaaa0001",
                "name": "Aisha",
                "category": "premade",
                "description": "Calm and clear",
                "preview_url": "https://example.invalid/aisha.mp3",
            },
            {
                "voice_id": "voicebbbb0002",
                "name": "Bilal",
                "category": None,
                "description": None,
                "preview_url": None,
            },
        ],
        "live_models": [{"id": "gemini-3.8-live", "label": "Default"}],
        "tts_models": [
            {"id": "eleven_v4_turbo", "label": "Turbo (fastest)"},
            {"id": "eleven_v3", "label": "v3 (most expressive)"},
        ],
        "defaults": {
            "voice_id": "voice-123",
            "live_model": "gemini-3.8-live",
            "tts_model": "eleven_v4_turbo",
            "voice_provider": "elevenlabs",
        },
        "elevenlabs_available": True,
    }
    assert "test-key-not-real" not in response.text


def test_options_extra_models_from_settings(client, auth_headers, test_settings):
    test_settings.live_model_options_extra = " gemini-alt-live , ,gemini-3.8-live,bad id"
    test_settings.tts_model_options_extra = "eleven_next"
    body = client.get("/options", headers=auth_headers).json()
    assert body["live_models"] == [
        {"id": "gemini-3.8-live", "label": "Default"},
        {"id": "gemini-alt-live", "label": "gemini-alt-live"},
    ]
    assert body["tts_models"][-1] == {"id": "eleven_next", "label": "eleven_next"}


def test_options_elevenlabs_unconfigured(client, auth_headers):
    client.app.dependency_overrides[get_elevenlabs_client] = lambda: ElevenLabsClient(None)
    response = client.get("/options", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["voices"] == []
    assert body["elevenlabs_available"] is False
    assert body["defaults"]["voice_provider"] == "gemini"
    assert body["defaults"]["voice_id"] is None
    assert body["live_models"] and body["tts_models"]
    assert "ELEVENLABS_API_KEY" not in response.text


def test_options_voice_list_failure_does_not_leak(client, auth_headers, fakes):
    fakes["elevenlabs"].list_fail = True
    response = client.get("/options", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["voices"] == []
    assert body["elevenlabs_available"] is False
    assert body["defaults"]["voice_provider"] == "gemini"
    assert "boom" not in response.text


def test_options_requires_auth(client):
    assert client.get("/options").status_code == 401


def test_options_is_rate_limited(client, auth_headers):
    codes = [client.get("/options", headers=auth_headers).status_code for _ in range(32)]
    assert codes[:30] == [200] * 30
    assert 429 in codes[30:]


def test_options_rate_limit_setting_default():
    from app.config import Settings

    assert Settings(environment="test").options_rate_limit == "30/minute"


def test_options_with_dev_fakes():
    from fastapi.testclient import TestClient

    from app.config import Settings, get_settings
    from app.main import create_app

    settings = Settings(environment="test", dev_fakes=True)
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as c:
        body = c.get("/options", headers={"Authorization": "Bearer dev:u1"}).json()
    assert [v["voice_id"] for v in body["voices"]] == [
        "fakevoice0001",
        "fakevoice0002",
        "fakevoice0003",
    ]
    assert body["elevenlabs_available"] is True
    # The dev default is one of the listed voices, so it validates in /session.
    assert body["defaults"]["voice_id"] == "fakevoice0001"
