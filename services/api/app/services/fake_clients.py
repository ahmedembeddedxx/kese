"""Deterministic in-process fakes used when `settings.dev_fakes` is true.

They let the whole stack (session, detect, segment, KB search, voice
tokens) run end to end with no API keys. They live in the app package, not
in tests, because Docker Compose and local dev use them at runtime;
`tests/conftest.py` keeps its own separate test doubles.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.gemini_client import EphemeralToken, RawDetection
from app.services.replicate_client import RawSegmentation

_GRID_COLUMNS = 3
_CELL = 300.0
_BOX = 200.0
_FAKE_EMBEDDING = [0.1, 0.2, 0.3]


class FakeGeminiClient:
    """Mirrors the `GeminiClient` interface with fixed outputs."""

    def mint_ephemeral_token(
        self,
        *,
        ttl_seconds: int,
        live_config: dict,
        tool_declarations: list[dict],
        system_prompt: str,
        model: str | None = None,
    ) -> EphemeralToken:
        return EphemeralToken(
            token="fake-ephemeral-token",
            expires_at=datetime.now(UTC) + timedelta(seconds=ttl_seconds),
        )

    def detect(
        self, *, image_bytes: bytes, targets: list[str], min_confidence: float
    ) -> tuple[list[RawDetection], int]:
        """One box per requested target, laid out on a 3 column grid."""
        detections: list[RawDetection] = []
        for index, label in enumerate(targets):
            row, col = divmod(index, _GRID_COLUMNS)
            ymin = 50.0 + row * _CELL
            xmin = 50.0 + col * _CELL
            detections.append(
                RawDetection(
                    label=label,
                    box_2d=(ymin, xmin, ymin + _BOX, xmin + _BOX),
                    polygon=None,
                    confidence=0.9,
                )
            )
        return [d for d in detections if d.confidence >= min_confidence], 1

    def embed_query(self, text: str) -> list[float]:
        return list(_FAKE_EMBEDDING)


class FakeReplicateClient:
    """Returns a short 2 point polyline starting at the tapped point."""

    def segment_from_point(
        self, *, image_bytes: bytes, point: tuple[float, float]
    ) -> tuple[RawSegmentation, int]:
        x, y = point
        end = (min(x + 50.0, 1000.0), min(y + 50.0, 1000.0))
        if end == (x, y):  # tapped the bottom right corner: keep 2 distinct points
            end = (max(x - 50.0, 0.0), max(y - 50.0, 0.0))
        return RawSegmentation(polyline=[(x, y), end]), 1
