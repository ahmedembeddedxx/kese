"""Embed step: chunk documents to ~500 tokens, embed each chunk, and
write them to Firestore's `kb_chunks` collection (read back by
services/api/app/services/kb_store.py).

Chunk size is approximated by word count (roughly 1.3 words per token
for English; this is a documented approximation, not an exact tokenizer
match -- see README.md). The embedding call itself is injected as a
callable so this module is testable without a live Gemini key; wiring
the real `GeminiClient.embed_query`-equivalent batch call is a follow-up
noted in README.md.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable

from kb_pipeline.schema import KBChunk, KBDocument

# ~500 tokens at ~1.3 words/token ≈ 385 words; rounded down to stay safely
# under the target, with a modest overlap so a step split across a chunk
# boundary isn't orphaned from its context.
CHUNK_SIZE_WORDS = 375
CHUNK_OVERLAP_WORDS = 50


def document_id(doc: KBDocument) -> str:
    """Stable id derived from the source URL, so re-running the pipeline
    updates existing chunks instead of duplicating them."""
    return hashlib.sha1(doc.source_url.encode("utf-8")).hexdigest()[:16]


def chunk_document(doc: KBDocument) -> list[KBChunk]:
    words = doc.body_markdown.split()
    if not words:
        return []

    doc_id = document_id(doc)
    chunks: list[KBChunk] = []
    start = 0
    index = 0
    step = CHUNK_SIZE_WORDS - CHUNK_OVERLAP_WORDS
    while start < len(words):
        chunk_words = words[start : start + CHUNK_SIZE_WORDS]
        chunks.append(
            KBChunk(
                doc_id=doc_id,
                chunk_index=index,
                text=" ".join(chunk_words),
                category=doc.category,
                brand=doc.brand,
                model=doc.model,
                title=doc.title,
                source_url=doc.source_url,
                licence=doc.licence,
            )
        )
        index += 1
        start += step
    return chunks


def embed_chunks(chunks: list[KBChunk], *, embedder: Callable[[str], list[float]]) -> list[KBChunk]:
    return [chunk.model_copy(update={"embedding": embedder(chunk.text)}) for chunk in chunks]


def write_chunks(chunks: list[KBChunk], *, firestore_client) -> None:
    collection = firestore_client.collection("kb_chunks")
    for chunk in chunks:
        if chunk.embedding is None:
            raise ValueError(
                f"Chunk {chunk.doc_id}#{chunk.chunk_index} has no embedding; "
                "call embed_chunks first"
            )
        chunk_id = f"{chunk.doc_id}-{chunk.chunk_index}"
        collection.document(chunk_id).set(chunk.model_dump())
