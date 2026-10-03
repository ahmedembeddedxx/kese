"""Session event log storage: `events/{event_id}` in Firestore.

Used for the step-completed/failed/gate-confirmed/feedback/error log the
plan's `/events` endpoint is for, plus (separately, by `detect_timing`
events) the latency measurements the plan asks us to log for every
`/detect` call and every voice turn.

Never stores raw frames or audio -- only the small JSON the request
already validated via `EventRequest`.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.models import EventRequest


class EventStore:
    def __init__(self, client) -> None:
        self._client = client

    def append(self, uid: str, payload: EventRequest) -> None:
        event_id = str(uuid.uuid4())
        data = {
            "uid": uid,
            "session_id": payload.session_id,
            "playbook_id": payload.playbook_id,
            "step_id": payload.step_id,
            "kind": payload.kind.value,
            "detail": payload.detail,
            "client_ts": payload.client_ts,
            "server_ts": datetime.now(UTC),
        }
        self._client.collection("events").document(event_id).set(data)
