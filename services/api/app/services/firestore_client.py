"""Firestore client, shared across stores.

Respects `FIRESTORE_EMULATOR_HOST` automatically (the underlying Google
client libraries read that env var themselves), so Docker Compose and CI
point this at the local emulator and nothing in application code needs to
know the difference.
"""

from __future__ import annotations

from functools import lru_cache

from app.config import Settings, get_settings


@lru_cache
def get_firestore_client(settings: Settings | None = None):
    settings = settings or get_settings()
    import google.cloud.firestore as firestore

    if settings.firebase_project_id:
        return firestore.Client(project=settings.firebase_project_id)
    return firestore.Client()
