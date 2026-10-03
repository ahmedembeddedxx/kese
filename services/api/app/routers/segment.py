from __future__ import annotations

import binascii
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import AuthedUser, get_current_user
from app.config import Settings, get_settings
from app.dependencies import get_replicate_client
from app.models import Point1000, SegmentRequest, SegmentResponse
from app.rate_limit import limiter
from app.services.gemini_client import decode_image_b64
from app.services.replicate_client import ReplicateClient, ReplicateClientError

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/segment", response_model=SegmentResponse)
@limiter.limit(get_settings().segment_rate_limit)
def segment(
    request: Request,
    body: SegmentRequest,
    user: AuthedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    replicate: ReplicateClient = Depends(get_replicate_client),
) -> SegmentResponse:
    try:
        image_bytes = decode_image_b64(body.image_b64)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="image_b64 is not valid base64"
        ) from exc

    if len(image_bytes) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Image exceeds the {settings.max_upload_bytes} byte limit",
        )

    try:
        raw, latency_ms = replicate.segment_from_point(
            image_bytes=image_bytes, point=(body.point.x, body.point.y)
        )
    except ReplicateClientError as exc:
        logger.warning("Segmentation fallback failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Wire segmentation is temporarily unavailable. Please try again shortly.",
        ) from exc

    from app.config import ModelConfig

    return SegmentResponse(
        wire_id=f"w-{uuid.uuid4().hex[:8]}",
        polyline=[Point1000(x=p[0], y=p[1]) for p in raw.polyline],
        suggested_color=None,
        model=ModelConfig.SEGMENTATION_FALLBACK,
        latency_ms=latency_ms,
    )
