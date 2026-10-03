"""Loads and validates `sources/*.yaml` into `SourceConfig` objects.

`*.example.yaml` files are templates (see sources/README.md) and are
skipped by default, since their placeholder URLs were never meant to be
crawled.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from kb_pipeline.schema import SourceConfig

SOURCES_DIR = Path(__file__).resolve().parents[1] / "sources"


def load_sources(
    sources_dir: Path = SOURCES_DIR, *, include_examples: bool = False
) -> list[SourceConfig]:
    sources: list[SourceConfig] = []
    for path in sorted(sources_dir.glob("*.yaml")):
        if path.name.endswith(".example.yaml") and not include_examples:
            continue
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        sources.append(SourceConfig(**data))
    return sources
