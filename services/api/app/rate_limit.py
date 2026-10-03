"""Per-user rate limiting for the endpoints the plan flags as needing it:
`/detect` and `/session` (AGENTS.md security review rule), plus `/segment`
since it is the same shape of call as `/detect`.

The limiter keys by the caller's bearer token when present (cheap to
extract, doesn't need full signature verification just to bucket
requests) and falls back to remote address for unauthenticated calls, so
one user's quota can't be exhausted by a different user's traffic.

Known limitation: slowapi's default limiter is in-memory, so limits are
per-instance, not global, if Cloud Run ever scales beyond one instance.
Acceptable at hackathon scale (see decisions.md D-001); revisit with a
shared store (e.g. Firestore-backed or Redis) before higher-traffic
production use.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _rate_limit_key(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        if token:
            return f"token:{token[:128]}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_rate_limit_key)
