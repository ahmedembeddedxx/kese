"""ElevenLabsClient against a mocked HTTP layer (no network, no real key)."""

from __future__ import annotations

import types

import httpx
import pytest

from app.services import elevenlabs_client
from app.services.elevenlabs_client import (
    ElevenLabsClient,
    ElevenLabsClientError,
    ElevenLabsVoice,
    FakeElevenLabsClient,
    reset_voices_cache,
)

SECRET = "sk-super-secret-key"


def _patch_post(monkeypatch, handler):
    transport = httpx.MockTransport(handler)

    def fake_post(url, **kwargs):
        with httpx.Client(transport=transport) as c:
            return c.post(url, **kwargs)

    monkeypatch.setattr(httpx, "post", fake_post)


def test_mint_success_sends_key_header_and_correct_url(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers.get("xi-api-key")
        return httpx.Response(200, json={"token": "sutkn_abc"})

    _patch_post(monkeypatch, handler)
    assert ElevenLabsClient(SECRET).mint_single_use_token("realtime_scribe") == "sutkn_abc"
    assert seen["url"] == "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe"
    assert seen["key"] == SECRET


def test_missing_key_raises_without_http_call(monkeypatch):
    _patch_post(monkeypatch, lambda r: pytest.fail("must not call the network"))
    with pytest.raises(ElevenLabsClientError):
        ElevenLabsClient(None).mint_single_use_token("tts_websocket")


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"detail": "bad"}),
        httpx.Response(500, text="oops"),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"nope": 1}),
        httpx.Response(200, json={"token": ""}),
        httpx.Response(200, json=["token"]),
    ],
)
def test_bad_responses_raise_without_leaking_key(monkeypatch, response):
    _patch_post(monkeypatch, lambda r: response)
    with pytest.raises(ElevenLabsClientError) as excinfo:
        ElevenLabsClient(SECRET).mint_single_use_token("tts_websocket")
    assert SECRET not in str(excinfo.value)


def test_transport_error_raises_without_leaking_key(monkeypatch):
    def handler(request):
        raise httpx.ConnectTimeout(f"timed out talking with {SECRET}")

    _patch_post(monkeypatch, handler)
    with pytest.raises(ElevenLabsClientError) as excinfo:
        ElevenLabsClient(SECRET).mint_single_use_token("realtime_scribe")
    assert SECRET not in str(excinfo.value)


def test_timeout_is_ten_seconds(monkeypatch):
    seen = {}

    def fake_post(url, **kwargs):
        seen.update(kwargs)
        return httpx.Response(200, json={"token": "t"})

    monkeypatch.setattr(httpx, "post", fake_post)
    ElevenLabsClient(SECRET).mint_single_use_token("tts_websocket")
    assert seen["timeout"] == 10.0


def test_fake_client_is_deterministic():
    fake = FakeElevenLabsClient()
    assert fake.mint_single_use_token("realtime_scribe") == "fake-stt-token"
    assert fake.mint_single_use_token("tts_websocket") == "fake-tts-token"


# --- list_voices ---------------------------------------------------------------

_VOICES_PAYLOAD = {
    "voices": [
        {
            "voice_id": "voiceaaaa0001",
            "name": "Aisha",
            "category": "premade",
            "description": "Calm and clear",
            "preview_url": "https://example.invalid/aisha.mp3",
            "labels": {"accent": "pk"},
        },
        {"voice_id": "voicebbbb0002", "name": "Bilal", "category": None, "description": ""},
        {"name": "no id, skipped"},
        "not a dict",
    ]
}


@pytest.fixture(autouse=True)
def _fresh_voices_cache():
    reset_voices_cache()
    yield
    reset_voices_cache()


def _patch_get(monkeypatch, handler):
    transport = httpx.MockTransport(handler)
    calls = []

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        with httpx.Client(transport=transport) as c:
            return c.get(url, **kwargs)

    monkeypatch.setattr(httpx, "get", fake_get)
    return calls


def test_list_voices_parses_fields_and_sends_key(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers.get("xi-api-key")
        return httpx.Response(200, json=_VOICES_PAYLOAD)

    calls = _patch_get(monkeypatch, handler)
    voices = ElevenLabsClient(SECRET).list_voices()
    assert seen == {"url": "https://api.elevenlabs.io/v1/voices", "key": SECRET}
    assert calls[0][1]["timeout"] == 10.0
    assert voices == [
        ElevenLabsVoice(
            voice_id="voiceaaaa0001",
            name="Aisha",
            category="premade",
            description="Calm and clear",
            preview_url="https://example.invalid/aisha.mp3",
        ),
        ElevenLabsVoice(voice_id="voicebbbb0002", name="Bilal"),
    ]


def test_list_voices_is_cached_for_five_minutes(monkeypatch):
    clock = types.SimpleNamespace(now=1000.0)
    monkeypatch.setattr(
        elevenlabs_client, "time", types.SimpleNamespace(monotonic=lambda: clock.now)
    )
    calls = _patch_get(monkeypatch, lambda r: httpx.Response(200, json=_VOICES_PAYLOAD))
    client = ElevenLabsClient(SECRET)
    first = client.list_voices()
    clock.now += 299
    assert client.list_voices() == first
    assert len(calls) == 1
    clock.now += 2  # past 300 seconds
    client.list_voices()
    assert len(calls) == 2


def test_list_voices_cache_is_per_api_key_and_resettable(monkeypatch):
    calls = _patch_get(monkeypatch, lambda r: httpx.Response(200, json=_VOICES_PAYLOAD))
    ElevenLabsClient("key-one").list_voices()
    ElevenLabsClient("key-two").list_voices()
    assert len(calls) == 2
    ElevenLabsClient("key-one").list_voices()
    assert len(calls) == 2
    reset_voices_cache()
    ElevenLabsClient("key-one").list_voices()
    assert len(calls) == 3


def test_list_voices_failures_are_not_cached(monkeypatch):
    responses = [httpx.Response(500, text="oops"), httpx.Response(200, json=_VOICES_PAYLOAD)]
    _patch_get(monkeypatch, lambda r: responses.pop(0))
    client = ElevenLabsClient(SECRET)
    with pytest.raises(ElevenLabsClientError):
        client.list_voices()
    assert len(client.list_voices()) == 2


def test_list_voices_missing_key_raises_without_http_call(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: pytest.fail("must not call the network"))
    with pytest.raises(ElevenLabsClientError):
        ElevenLabsClient(None).list_voices()


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"detail": "bad"}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"nope": 1}),
        httpx.Response(200, json={"voices": "x"}),
        httpx.Response(200, json=["voices"]),
    ],
)
def test_list_voices_bad_responses_raise_without_leaking_key(monkeypatch, response):
    _patch_get(monkeypatch, lambda r: response)
    with pytest.raises(ElevenLabsClientError) as excinfo:
        ElevenLabsClient(SECRET).list_voices()
    assert SECRET not in str(excinfo.value)


def test_list_voices_transport_error_raises_without_leaking_key(monkeypatch):
    def handler(request):
        raise httpx.ConnectTimeout(f"timed out talking with {SECRET}")

    _patch_get(monkeypatch, handler)
    with pytest.raises(ElevenLabsClientError) as excinfo:
        ElevenLabsClient(SECRET).list_voices()
    assert SECRET not in str(excinfo.value)


def test_fake_client_lists_three_voices_matching_the_request_pattern():
    import re

    voices = FakeElevenLabsClient().list_voices()
    assert [v.voice_id for v in voices] == ["fakevoice0001", "fakevoice0002", "fakevoice0003"]
    assert all(re.fullmatch(r"[A-Za-z0-9_-]{8,64}", v.voice_id) for v in voices)
