from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import AuthedUser, get_current_user
from app.dependencies import get_gemini_client, get_kb_store
from app.models import KBSearchResponse
from app.services.gemini_client import GeminiClient, GeminiClientError
from app.services.kb_store import KBStore, KBStoreUnavailable

router = APIRouter()


@router.get("/kb/search", response_model=KBSearchResponse)
def search_kb(
    q: str = Query(min_length=2, max_length=300),
    category: str | None = Query(default=None, pattern="^(electrical|ac|car|general)$"),
    limit: int = Query(default=5, ge=1, le=20),
    user: AuthedUser = Depends(get_current_user),
    gemini: GeminiClient = Depends(get_gemini_client),
    kb: KBStore = Depends(get_kb_store),
) -> KBSearchResponse:
    try:
        embedding = gemini.embed_query(q)
    except GeminiClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not embed the search query: {exc}",
        ) from exc

    try:
        results = kb.search(query_embedding=embedding, category=category, limit=limit)
    except KBStoreUnavailable as exc:
        # Deliberately 503, not an empty 200: an empty result must only ever
        # mean "nothing relevant", never "couldn't reach the KB".
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Knowledge base is temporarily unavailable: {exc}",
        ) from exc

    return KBSearchResponse(query=q, results=results)
