from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import AuthedUser, get_current_user
from app.config import Settings, get_settings
from app.dependencies import get_gemini_client
from app.live_tools import TOOL_DECLARATIONS, TOOL_NAMES, build_system_prompt
from app.models import SessionRequest, SessionResponse
from app.playbooks import PlaybookNotFoundError, get_playbook_registry
from app.rate_limit import limiter
from app.services.gemini_client import GeminiClient, GeminiClientError

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/session", response_model=SessionResponse)
@limiter.limit(get_settings().session_rate_limit)
def create_session(
    request: Request,
    body: SessionRequest,
    user: AuthedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    gemini: GeminiClient = Depends(get_gemini_client),
) -> SessionResponse:
    registry = get_playbook_registry()
    playbook = None
    if body.playbook_id:
        try:
            playbook = registry.get(body.playbook_id)
        except PlaybookNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown playbook_id: {body.playbook_id}",
            ) from exc
        if playbook["category"] != body.category:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="playbook_id does not belong to the given category",
            )

    system_prompt = build_system_prompt(
        category=body.category, playbook=playbook, language=body.language
    )

    try:
        token = gemini.mint_ephemeral_token(
            ttl_seconds=settings.ephemeral_token_ttl_seconds,
            system_prompt=system_prompt,
            tool_names=TOOL_NAMES,
        )
    except GeminiClientError as exc:
        # Log the real cause server-side; never echo internal exception
        # text (which can reveal configuration state) back to the client.
        logger.warning("Could not start a Live session: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not start a Live session right now. Please try again shortly.",
        ) from exc

    return SessionResponse(
        ephemeral_token=token.token,
        expires_at=token.expires_at,
        live_model=_live_model_name(),
        system_prompt=system_prompt,
        playbook_id=playbook["id"] if playbook else None,
        tool_declarations=TOOL_DECLARATIONS,
    )


def _live_model_name() -> str:
    from app.config import ModelConfig

    return ModelConfig.LIVE
