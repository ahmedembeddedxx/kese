"""Clean step: deduplicate near-identical pages with MinHash, and score
page quality so low-quality pages can be dropped before they're indexed.

The MinHash dedup is real and testable offline. The "LLM quality score"
the plan calls for is injected as a callable (`scorer`) rather than
hardcoded to a live Gemini call, so it's testable with a fake scorer; the
default fallback is a documented, crude heuristic, not a real quality
judgement -- see README.md "What's implemented vs stubbed".
"""

from __future__ import annotations

from collections.abc import Callable

from datasketch import MinHash, MinHashLSH

from kb_pipeline.schema import KBDocument

NUM_PERM = 128
_SHINGLE_SIZE = 5


def _shingles(text: str, size: int = _SHINGLE_SIZE) -> set[str]:
    words = text.split()
    if len(words) < size:
        return {" ".join(words)} if words else set()
    return {" ".join(words[i : i + size]) for i in range(len(words) - size + 1)}


def compute_minhash(text: str) -> MinHash:
    minhash = MinHash(num_perm=NUM_PERM)
    for shingle in _shingles(text):
        minhash.update(shingle.encode("utf-8"))
    return minhash


def deduplicate(docs: list[KBDocument], *, threshold: float = 0.85) -> list[KBDocument]:
    """Drop documents whose body is near-identical to one already kept,
    using MinHash LSH so this stays roughly linear instead of O(n^2).
    Keeps the first occurrence of each near-duplicate cluster.
    """
    lsh = MinHashLSH(threshold=threshold, num_perm=NUM_PERM)
    kept: list[KBDocument] = []
    for i, doc in enumerate(docs):
        minhash = compute_minhash(doc.body_markdown)
        key = str(i)
        if lsh.query(minhash):
            continue
        lsh.insert(key, minhash)
        kept.append(doc)
    return kept


def heuristic_quality_score(doc: KBDocument) -> float:
    """Crude, real fallback: longer, step-having documents score higher.
    Not a substitute for the plan's LLM quality score -- pass a real
    `scorer` to `filter_low_quality` once one exists.
    """
    length_score = min(len(doc.body_markdown) / 2000, 1.0)
    steps_score = min(len(doc.steps) / 5, 1.0)
    return 0.6 * length_score + 0.4 * steps_score


def filter_low_quality(
    docs: list[KBDocument],
    *,
    threshold: float = 0.3,
    scorer: Callable[[KBDocument], float] = heuristic_quality_score,
) -> list[KBDocument]:
    return [doc for doc in docs if scorer(doc) >= threshold]
