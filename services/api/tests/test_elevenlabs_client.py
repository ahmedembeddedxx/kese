"""ElevenLabsClient against a mocked HTTP layer (no network, no real key)."""

from __future__ import annotations

import httpx
import pytest

from app.services.elevenlabs_client import (
    ElevenLabsClient,
    ElevenLabsClientError,
    FakeElevenLabsClient,
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
