from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import AuthedUser, get_current_user
from app.models import PlaybookDetail, PlaybookListResponse, PlaybookSummary
from app.playbooks import PlaybookNotFoundError, get_playbook_registry

router = APIRouter()


@router.get("/playbooks", response_model=PlaybookListResponse)
def list_playbooks(
    category: str | None = Query(default=None, pattern="^(electrical|ac|car)$"),
    user: AuthedUser = Depends(get_current_user),
) -> PlaybookListResponse:
    registry = get_playbook_registry()
    playbooks = registry.list_for_category(category) if category else registry.all()
    summaries = [PlaybookSummary(**p) for p in playbooks]
    return PlaybookListResponse(playbooks=summaries)


@router.get("/playbooks/{playbook_id}", response_model=PlaybookDetail)
def get_playbook(
    playbook_id: str,
    user: AuthedUser = Depends(get_current_user),
) -> PlaybookDetail:
    registry = get_playbook_registry()
    try:
        playbook = registry.get(playbook_id)
    except PlaybookNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown playbook_id: {playbook_id}"
        ) from exc
    return PlaybookDetail(**playbook)
