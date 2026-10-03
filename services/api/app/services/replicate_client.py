"""Thin wrapper around the Replicate SAM fallback used for wire/part
segmentation when the on-device MediaPipe Interactive Segmenter result is
poor or unavailable (see technical plan, "Wire mapping", step 5).

Not exercised against a live token yet -- see handover.md. Verify the
exact `replicate.run` output shape against the real model before the
first demo and note that verification in the PR, per AGENTS.md.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from app.config import ModelConfig


@dataclass(frozen=True)
class RawSegmentation:
    polyline: list[tuple[float, float]]  # normalized 0-1000 points


class ReplicateClientError(RuntimeError):
    pass


class ReplicateClient:
    def __init__(self, api_token: str | None) -> None:
        self._api_token = api_token

    def segment_from_point(
        self, *, image_bytes: bytes, point: tuple[float, float]
    ) -> tuple[RawSegmentation, int]:
        if not self._api_token:
            raise ReplicateClientError("REPLICATE_API_TOKEN is not configured")

        import replicate

        started = time.monotonic()
        client = replicate.Client(api_token=self._api_token)
        output = client.run(
            ModelConfig.SEGMENTATION_FALLBACK,
            input={
                "image": _as_data_uri(image_bytes),
                "point_coords": [[point[0], point[1]]],
                "point_labels": [1],
            },
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        polyline = _mask_output_to_polyline(output)
        return RawSegmentation(polyline=polyline), latency_ms


def _as_data_uri(image_bytes: bytes) -> str:
    import base64

    return "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")


def _mask_output_to_polyline(output) -> list[tuple[float, float]]:
    """Replicate SAM models return a mask (often a URL or array); turning
    that into a thinned polyline is a real image-processing step belonging
    to `pipelines/kb`-style tooling, not duplicated here. For now this
    expects the model to already return `{"polyline": [[x, y], ...]}` in
    its structured output, and raises clearly if it doesn't, so a mismatch
    fails loudly during the first real smoke test instead of silently
    drawing a wrong wire.
    """
    if isinstance(output, dict) and "polyline" in output:
        return [tuple(p) for p in output["polyline"]]
    raise ReplicateClientError(
        "Unexpected Replicate output shape; update _mask_output_to_polyline "
        "once the real model response is known"
    )
