"""Saved-device storage: `users/{uid}/devices/{device_id}` in Firestore.

A user only ever reads or writes their own `uid` subtree -- enforced both
here (every query is scoped under the authenticated uid) and by the
Firestore security rules in `infra/firestore.rules`, so a bug in one layer
doesn't expose another user's data.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.models import Device, DeviceCreateRequest


class DeviceStore:
    def __init__(self, client) -> None:
        self._client = client

    def _collection(self, uid: str):
        return self._client.collection("users").document(uid).collection("devices")

    def list_devices(self, uid: str) -> list[Device]:
        docs = self._collection(uid).stream()
        return [_doc_to_device(doc.id, doc.to_dict()) for doc in docs]

    def create_device(self, uid: str, payload: DeviceCreateRequest) -> Device:
        device_id = str(uuid.uuid4())
        saved_at = datetime.now(UTC)
        data = {
            "kind": payload.kind.value,
            "details": payload.details,
            "nickname": payload.nickname,
            "saved_at": saved_at,
        }
        self._collection(uid).document(device_id).set(data)
        fields = {k: v for k, v in data.items() if k != "saved_at"}
        return Device(id=device_id, saved_at=saved_at, **fields)


def _doc_to_device(doc_id: str, data: dict) -> Device:
    return Device(
        id=doc_id,
        kind=data["kind"],
        details=data.get("details", {}),
        nickname=data.get("nickname"),
        saved_at=data["saved_at"],
    )
