from __future__ import annotations

from datetime import UTC, datetime

from kb_pipeline.clean import deduplicate, filter_low_quality, heuristic_quality_score
from kb_pipeline.schema import KBDocument


def _doc(body: str, title: str = "t", steps: list[str] | None = None) -> KBDocument:
    return KBDocument(
        category="electrical",
        title=title,
        body_markdown=body,
        steps=steps or [],
        source_url=f"https://example.com/{title}",
        licence="retrieval-only, cite source",
        retrieved_at=datetime.now(UTC),
    )


LONG_PARAGRAPH = " ".join(f"word{i}" for i in range(200))


def test_deduplicate_drops_near_identical_bodies():
    docs = [
        _doc(LONG_PARAGRAPH, title="a"),
        _doc(LONG_PARAGRAPH + " word200", title="b"),  # near-identical
        _doc("Completely different content about AC drains and filters.", title="c"),
    ]
    kept = deduplicate(docs, threshold=0.8)
    titles = {d.title for d in kept}
    assert "a" in titles
    assert "c" in titles
    assert "b" not in titles  # dropped as a near-duplicate of "a"
    assert len(kept) == 2


def test_deduplicate_keeps_all_when_distinct():
    docs = [
        _doc("alpha beta gamma delta " * 20, title="a"),
        _doc("completely unrelated text " * 20, title="b"),
    ]
    assert len(deduplicate(docs)) == 2


def test_heuristic_quality_score_prefers_longer_documents_with_steps():
    short = _doc("short")
    long_with_steps = _doc(LONG_PARAGRAPH * 10, steps=["s1", "s2", "s3", "s4", "s5"])
    assert heuristic_quality_score(long_with_steps) > heuristic_quality_score(short)


def test_filter_low_quality_drops_below_threshold():
    docs = [_doc("short"), _doc(LONG_PARAGRAPH * 10, steps=["s1", "s2", "s3", "s4", "s5"])]
    kept = filter_low_quality(docs, threshold=0.5)
    assert len(kept) == 1
    assert len(kept[0].body_markdown) > len(docs[0].body_markdown)


def test_filter_low_quality_uses_injected_scorer():
    docs = [_doc("body a", title="a"), _doc("body b", title="b")]
    kept = filter_low_quality(docs, threshold=0.5, scorer=lambda d: 1.0 if d.title == "b" else 0.0)
    assert [d.title for d in kept] == ["b"]
