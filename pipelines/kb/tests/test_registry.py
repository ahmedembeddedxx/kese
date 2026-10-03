from __future__ import annotations

from kb_pipeline.registry import load_sources


def test_example_sources_skipped_by_default():
    assert load_sources() == []


def test_example_sources_load_when_requested():
    sources = load_sources(include_examples=True)
    ids = {s.id for s in sources}
    assert "electrical-manufacturer-manuals-example" in ids
    assert "ac-service-manuals-example" in ids
    assert "car-owners-manuals-example" in ids
    for source in sources:
        assert source.rate_limit_seconds >= 0.5
        assert source.start_urls
