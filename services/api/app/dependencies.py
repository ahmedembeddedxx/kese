"""FastAPI dependency providers.

Every external integration (Gemini, Replicate, Firestore-backed stores) is
provided through one of these functions so tests can override them with
fakes via `app.dependency_overrides[...]` instead of monkeypatching SDKs.
"""

from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.services.device_store import DeviceStore
from app.services.event_store import EventStore
from app.services.gemini_client import GeminiClient
from app.services.kb_store import KBStore
from app.services.replicate_client import ReplicateClient


@lru_cache
def get_gemini_client() -> GeminiClient:
    settings = get_settings()
    return GeminiClient(api_key=settings.gemini_api_key)


@lru_cache
def get_replicate_client() -> ReplicateClient:
    settings = get_settings()
    return ReplicateClient(api_token=settings.replicate_api_token)


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
