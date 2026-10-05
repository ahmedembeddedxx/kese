from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.rate_limit import limiter
from app.routers import (
    detect,
    devices,
    events,
    gates,
    kb,
    options,
    playbooks,
    segment,
    session,
    voice,
)

settings = get_settings()

# A base64 JPEG is roughly 4/3 the size of the raw bytes, plus the JSON
# envelope. Reject anything clearly oversized before the body is even
# parsed, so a malicious huge payload can't be used to exhaust memory.
_MAX_REQUEST_BYTES = int(settings.max_upload_bytes * 1.5) + 4096


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                length = int(content_length)
            except ValueError:
                length = None
            if length is not None and length > _MAX_REQUEST_BYTES:
                return JSONResponse(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    content={"detail": "Request body too large"},
                )
        return await call_next(request)


def create_app() -> FastAPI:
    app = FastAPI(title="Mend API", version="0.1.0")

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(MaxBodySizeMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    app.include_router(session.router)
    app.include_router(detect.router)
    app.include_router(segment.router)
    app.include_router(kb.router)
    app.include_router(devices.router)
    app.include_router(events.router)
    app.include_router(playbooks.router)
    app.include_router(gates.router)
    app.include_router(voice.router)
    app.include_router(options.router)

    @app.get("/healthz")
    def healthz() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
