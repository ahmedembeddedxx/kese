from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.dependencies import (
    get_device_store,
    get_event_store,
    get_gemini_client,
    get_kb_store,
    get_replicate_client,
)
from app.main import create_app
from app.services.gemini_client import EphemeralToken, RawDetection
from app.services.replicate_client import RawSegmentation


class FakeGeminiClient:
    """Stand-in for GeminiClient; routers only depend on this interface."""

    def __init__(self) -> None:
        self.detect_calls: list[dict] = []
        self.next_detections: list[RawDetection] = [
            RawDetection(
                label="fan capacitor",
                box_2d=(100.0, 120.0, 300.0, 320.0),
                polygon=None,
                confidence=0.92,
            )
        ]
        self.fail = False

    def mint_ephemeral_token(self, *, ttl_seconds, system_prompt, tool_names) -> EphemeralToken:
        if self.fail:
            from app.services.gemini_client import GeminiClientError

            raise GeminiClientError("boom")
        return EphemeralToken(
            token="fake-ephemeral-token",
            expires_at=datetime.now(UTC) + timedelta(seconds=ttl_seconds),
        )

    def detect(self, *, image_bytes, targets, min_confidence):
        self.detect_calls.append({"targets": targets, "min_confidence": min_confidence})
        if self.fail:
            from app.services.gemini_client import GeminiClientError

            raise GeminiClientError("boom")
        filtered = [d for d in self.next_detections if d.confidence >= min_confidence]
        return filtered, 42

    def embed_query(self, text: str) -> list[float]:
        if self.fail:
            from app.services.gemini_client import GeminiClientError

            raise GeminiClientError("boom")
        return [0.1, 0.2, 0.3]


class FakeReplicateClient:
    def __init__(self) -> None:
        self.fail = False

    def segment_from_point(self, *, image_bytes, point):
        if self.fail:
            from app.services.replicate_client import ReplicateClientError

            raise ReplicateClientError("boom")
        return RawSegmentation(polyline=[(point[0], point[1]), (point[0] + 5, point[1] + 5)]), 77


class FakeKBStore:
    def __init__(self) -> None:
        self.fail = False
        self.next_results: list = []

    def search(self, *, query_embedding, category, limit):
        if self.fail:
            from app.services.kb_store import KBStoreUnavailable

            raise KBStoreUnavailable("no index")
        return self.next_results[:limit]


class FakeDeviceStore:
    def __init__(self) -> None:
        self._by_uid: dict[str, list] = {}

    def list_devices(self, uid: str):
        return self._by_uid.get(uid, [])

    def create_device(self, uid: str, payload):
        from app.models import Device

        device = Device(
            id=f"dev-{len(self._by_uid.get(uid, []))}",
            kind=payload.kind,
            details=payload.details,
            nickname=payload.nickname,
            saved_at=datetime.now(UTC),
        )
        self._by_uid.setdefault(uid, []).append(device)
        return device


class FakeEventStore:
    def __init__(self) -> None:
        self.events: list = []

    def append(self, uid: str, payload) -> None:
        self.events.append((uid, payload))


@pytest.fixture
def test_settings() -> Settings:
    return Settings(environment="test")


@pytest.fixture
def fakes():
    return {
        "gemini": FakeGeminiClient(),
        "replicate": FakeReplicateClient(),
        "kb": FakeKBStore(),
        "devices": FakeDeviceStore(),
        "events": FakeEventStore(),
    }


@pytest.fixture
def client(test_settings, fakes):
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[get_gemini_client] = lambda: fakes["gemini"]
    app.dependency_overrides[get_replicate_client] = lambda: fakes["replicate"]
    app.dependency_overrides[get_kb_store] = lambda: fakes["kb"]
    app.dependency_overrides[get_device_store] = lambda: fakes["devices"]
    app.dependency_overrides[get_event_store] = lambda: fakes["events"]
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer dev:test-user-1"}
