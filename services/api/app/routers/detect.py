from __future__ import annotations

import binascii

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import AuthedUser, get_current_user
from app.config import Settings, get_settings
from app.dependencies import get_gemini_client
from app.models import Box2D, Detection, DetectRequest, DetectResponse, Point1000
from app.rate_limit import limiter
from app.services.gemini_client import GeminiClient, GeminiClientError, decode_image_b64

router = APIRouter()


@router.post("/detect", response_model=DetectResponse)
@limiter.limit(get_settings().detect_rate_limit)
def detect(
    request: Request,
    body: DetectRequest,
    user: AuthedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    gemini: GeminiClient = Depends(get_gemini_client),
) -> DetectResponse:
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
        raw_detections, latency_ms = gemini.detect(
            image_bytes=image_bytes, targets=body.targets, min_confidence=body.min_confidence
        )
    except GeminiClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Detection failed: {exc}",
        ) from exc

    detections = [
        Detection(
            label=d.label,
            box_2d=Box2D(ymin=d.box_2d[0], xmin=d.box_2d[1], ymax=d.box_2d[2], xmax=d.box_2d[3]),
            polygon=[Point1000(x=p[0], y=p[1]) for p in d.polygon] if d.polygon else None,
            confidence=d.confidence,
        )
        for d in raw_detections
    ]

    from app.config import ModelConfig

    return DetectResponse(detections=detections, model=ModelConfig.DETECTION, latency_ms=latency_ms)
