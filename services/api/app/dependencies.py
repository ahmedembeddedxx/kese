"""FastAPI dependency providers.

Every external integration (Gemini, Replicate, Firestore-backed stores) is
provided through one of these functions so tests can override them with
fakes via `app.dependency_overrides[...]` instead of monkeypatching SDKs.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import Depends

from app.config import Settings, get_settings
from app.services.device_store import DeviceStore
from app.services.elevenlabs_client import ElevenLabsClient, FakeElevenLabsClient
from app.services.event_store import EventStore
from app.services.fake_clients import FakeGeminiClient, FakeReplicateClient
from app.services.gemini_client import GeminiClient
from app.services.kb_store import KBStore
from app.services.replicate_client import ReplicateClient


@lru_cache
def _real_gemini_client(api_key: str | None) -> GeminiClient:
    return GeminiClient(api_key=api_key)


@lru_cache
def _real_replicate_client(api_token: str | None) -> ReplicateClient:
    return ReplicateClient(api_token=api_token)


@lru_cache
def _real_elevenlabs_client(api_key: str | None) -> ElevenLabsClient:
    return ElevenLabsClient(api_key=api_key)


# Each provider returns the deterministic fake when `settings.dev_fakes` is
# set (which Settings refuses in production), else the real client.


def get_gemini_client(settings: Settings = Depends(get_settings)):
    if settings.dev_fakes:
        return FakeGeminiClient()
    return _real_gemini_client(settings.gemini_api_key)


def get_replicate_client(settings: Settings = Depends(get_settings)):
    if settings.dev_fakes:
        return FakeReplicateClient()
    return _real_replicate_client(settings.replicate_api_token)


def get_elevenlabs_client(settings: Settings = Depends(get_settings)):
    if settings.dev_fakes:
        return FakeElevenLabsClient()
    return _real_elevenlabs_client(settings.elevenlabs_api_key)


@lru_cache
def get_device_store() -> DeviceStore:
    from app.services.firestore_client import get_firestore_client

    return DeviceStore(get_firestore_client())


@lru_cache
def get_event_store() -> EventStore:
    from app.services.firestore_client import get_firestore_client

    return EventStore(get_firestore_client())


@lru_cache
def get_kb_store() -> KBStore:
    from app.services.firestore_client import get_firestore_client

    return KBStore(get_firestore_client())
