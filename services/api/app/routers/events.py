from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthedUser, get_current_user
from app.dependencies import get_event_store
from app.models import EventRequest, EventResponse
from app.services.event_store import EventStore

router = APIRouter()


@router.post("/events", response_model=EventResponse, status_code=202)
def record_event(
    body: EventRequest,
    user: AuthedUser = Depends(get_current_user),
    store: EventStore = Depends(get_event_store),
) -> EventResponse:
    store.append(user.uid, body)
    return EventResponse()
