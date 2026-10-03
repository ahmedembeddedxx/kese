from __future__ import annotations

import pytest
from pydantic import ValidationError

from kb_pipeline.schema import SourceConfig


def test_source_config_accepts_valid_entry():
    source = SourceConfig(
        id="example-source",
        category="electrical",
        kind="html",
        start_urls=["https://example.com/manuals/"],
        licence="retrieval-only, cite source",
    )
    assert source.rate_limit_seconds == 2.0
    assert source.max_pages == 500


def test_source_config_rejects_bad_id():
    with pytest.raises(ValidationError):
        SourceConfig(
            id="Not Valid ID!",
            category="electrical",
            kind="html",
            start_urls=["https://example.com/"],
            licence="x",
        )


def test_source_config_rejects_unknown_category():
    with pytest.raises(ValidationError):
        SourceConfig(
            id="plumbing-guides",
            category="plumbing",
            kind="html",
            start_urls=["https://example.com/"],
            licence="x",
        )


def test_source_config_requires_at_least_one_start_url():
    with pytest.raises(ValidationError):
        SourceConfig(id="x", category="car", kind="pdf", start_urls=[], licence="x")
