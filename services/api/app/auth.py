"""Request authentication.

Every endpoint that touches user data (devices, events, session minting)
requires a verified identity. In production this is a Firebase ID token
verified server-side. Outside production (local Docker Compose, CI), a
`dev:<uid>` bearer token is accepted instead so the stack can be tested
end-to-end without a real Firebase project -- see decisions.md D-006.
The dev bypass is refused outright when `settings.is_production` is true,
even if someone sends a `dev:` token by mistake.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


@dataclass(frozen=True)
class AuthedUser:
    uid: str
    provider: str  # "firebase" | "dev"


@lru_cache
def _firebase_app():
    import firebase_admin

    if firebase_admin._apps:  # already initialized
        return firebase_admin.get_app()
    return firebase_admin.initialize_app()


def _verify_firebase_token(token: str) -> AuthedUser:
    from firebase_admin import auth as firebase_auth

    try:
        _firebase_app()
        decoded = firebase_auth.verify_id_token(token)
    except Exception as exc:  # noqa: BLE001 - any verification failure is unauthenticated
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token"
        ) from exc
    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token")
    return AuthedUser(uid=uid, provider="firebase")


def get_current_user(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> AuthedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Empty bearer token")

    if token.startswith("dev:"):
        if not settings.dev_auth_allowed:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Dev auth tokens are not accepted in this environment",
            )
        uid = token.removeprefix("dev:").strip()
        if not uid or len(uid) > 128:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid dev uid")
        return AuthedUser(uid=uid, provider="dev")

    return _verify_firebase_token(token)
