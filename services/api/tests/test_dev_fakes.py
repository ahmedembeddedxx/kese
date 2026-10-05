"""dev_fakes mode: the whole stack works with no API keys, and the mode is
refused in production."""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.dependencies import get_kb_store
from app.main import create_app


@pytest.fixture
def fakes_client(fakes):
    settings = Settings(environment="test", dev_fakes=True)
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    # Only Firestore-backed stores are stubbed; Gemini, Replicate and
    # ElevenLabs come from the real dependency providers in fakes mode.
    app.dependency_overrides[get_kb_store] = lambda: fakes["kb"]
    with TestClient(app) as c:
        yield c


def _image_b64() -> str:
    return base64.b64encode(b"\xff\xd8\xff fake jpeg bytes").decode()


def test_dev_fakes_refused_in_production():
    with pytest.raises(ValidationError, match="DEV_FAKES"):
        Settings(environment="production", dev_fakes=True)


def test_dev_fakes_refused_in_production_via_env(monkeypatch):
    monkeypatch.setenv("MEND_ENVIRONMENT", "production")
    monkeypatch.setenv("MEND_DEV_FAKES", "true")
    with pytest.raises(ValidationError):
        Settings()


def test_dev_fakes_allowed_outside_production():
    assert Settings(environment="development", dev_fakes=True).dev_fakes_allowed
    assert Settings(environment="test", dev_fakes=True).dev_fakes_allowed
    assert not Settings(environment="production").dev_fakes_allowed


def test_dev_fakes_defaults_off():
    assert Settings(environment="test").dev_fakes is False


def test_session_end_to_end_with_elevenlabs_and_no_keys(fakes_client, auth_headers):
    response = fakes_client.post(
        "/session",
        json={"category": "general", "language": "ur", "consent": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ephemeral_token"] == "fake-ephemeral-token"
    assert body["voice"]["provider"] == "elevenlabs"
    assert body["voice"]["elevenlabs"]["stt"]["token"] == "fake-stt-token"
    assert body["voice"]["elevenlabs"]["tts"]["token"] == "fake-tts-token"
    assert body["live_config"]["responseModalities"] == ["TEXT"]


def test_detect_returns_grid_boxes_for_each_target(fakes_client, auth_headers):
    targets = ["capacitor", "wire a", "wire b", "terminal"]
    response = fakes_client.post(
        "/detect", json={"image_b64": _image_b64(), "targets": targets}, headers=auth_headers
    )
    assert response.status_code == 200
    detections = response.json()["detections"]
    assert [d["label"] for d in detections] == targets
    assert all(d["confidence"] == 0.9 for d in detections)
    boxes = {tuple(d["box_2d"].values()) for d in detections}
    assert len(boxes) == len(targets)  # distinct grid cells, no overlap collapse
    # Deterministic: a second call returns the same thing.
    again = fakes_client.post(
        "/detect", json={"image_b64": _image_b64(), "targets": targets}, headers=auth_headers
    ).json()["detections"]
    assert again == detections


def test_segment_returns_two_point_polyline_from_tap(fakes_client, auth_headers):
    response = fakes_client.post(
        "/segment",
        json={"image_b64": _image_b64(), "point": {"x": 400, "y": 500}},
        headers=auth_headers,
    )
    assert response.status_code == 200
    polyline = response.json()["polyline"]
    assert len(polyline) == 2
    assert polyline[0] == {"x": 400, "y": 500}


def test_segment_at_bottom_right_corner_still_has_two_distinct_points(fakes_client, auth_headers):
    polyline = fakes_client.post(
        "/segment",
        json={"image_b64": _image_b64(), "point": {"x": 1000, "y": 1000}},
        headers=auth_headers,
    ).json()["polyline"]
    assert polyline[0] != polyline[1]


def test_kb_search_uses_constant_fake_embedding(fakes_client, auth_headers):
    response = fakes_client.get("/kb/search", params={"q": "fan humming"}, headers=auth_headers)
    assert response.status_code == 200


def test_voice_token_without_keys(fakes_client, auth_headers):
    response = fakes_client.post("/voice/token", json={"kind": "stt"}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"token": "fake-stt-token", "ttl_seconds": 900}
    response = fakes_client.post("/voice/token", json={"kind": "tts"}, headers=auth_headers)
    assert response.json()["token"] == "fake-tts-token"


def test_fake_gemini_filters_by_min_confidence():
    from app.services.fake_clients import FakeGeminiClient

    fake = FakeGeminiClient()
    assert fake.detect(image_bytes=b"", targets=["a"], min_confidence=0.95)[0] == []
    assert fake.embed_query("x") == fake.embed_query("y")
