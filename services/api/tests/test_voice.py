from __future__ import annotations


def test_voice_token_stt(client, auth_headers, fakes):
    response = client.post("/voice/token", json={"kind": "stt"}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"token": "fake-realtime_scribe-token", "ttl_seconds": 900}
    assert fakes["elevenlabs"].calls == ["realtime_scribe"]


def test_voice_token_tts(client, auth_headers, fakes):
    response = client.post("/voice/token", json={"kind": "tts"}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"token": "fake-tts_websocket-token", "ttl_seconds": 900}
    assert fakes["elevenlabs"].calls == ["tts_websocket"]


def test_voice_token_each_call_mints_a_fresh_token(client, auth_headers, fakes):
    for _ in range(3):
        assert client.post("/voice/token", json={"kind": "stt"}, headers=auth_headers).is_success
    assert fakes["elevenlabs"].calls == ["realtime_scribe"] * 3


def test_voice_token_failure_is_generic_503(client, auth_headers, fakes):
    fakes["elevenlabs"].fail = True
    response = client.post("/voice/token", json={"kind": "stt"}, headers=auth_headers)
    assert response.status_code == 503
    assert "boom" not in response.text
    assert "ELEVENLABS" not in response.text


def test_voice_token_not_configured_is_503(client, auth_headers, monkeypatch):
    # The real client with no key raises ElevenLabsClientError -> generic 503.
    from app.dependencies import get_elevenlabs_client
    from app.services.elevenlabs_client import ElevenLabsClient

    client.app.dependency_overrides[get_elevenlabs_client] = lambda: ElevenLabsClient(None)
    response = client.post("/voice/token", json={"kind": "tts"}, headers=auth_headers)
    assert response.status_code == 503
    assert "ELEVENLABS_API_KEY" not in response.text


def test_voice_token_requires_auth(client):
    response = client.post("/voice/token", json={"kind": "stt"})
    assert response.status_code == 401


def test_voice_token_rejects_bad_kind(client, auth_headers):
    assert client.post("/voice/token", json={"kind": "x"}, headers=auth_headers).status_code == 422
    assert client.post("/voice/token", json={}, headers=auth_headers).status_code == 422


def test_voice_token_is_rate_limited(client, auth_headers):
    codes = [
        client.post("/voice/token", json={"kind": "stt"}, headers=auth_headers).status_code
        for _ in range(32)
    ]
    assert codes[:30] == [200] * 30
    assert 429 in codes[30:]
