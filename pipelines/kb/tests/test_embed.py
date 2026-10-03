from __future__ import annotations

from datetime import UTC, datetime

from kb_pipeline.embed import chunk_document, document_id, embed_chunks, write_chunks
from kb_pipeline.schema import KBDocument


def _doc(word_count: int) -> KBDocument:
    body = " ".join(f"word{i}" for i in range(word_count))
    return KBDocument(
        category="car",
        title="Oil change guide",
        body_markdown=body,
        source_url="https://example.com/oil-change",
        licence="retrieval-only, cite source",
        retrieved_at=datetime.now(UTC),
    )


def test_document_id_is_stable_for_same_url():
    doc_a = _doc(10)
    doc_b = _doc(10)
    assert document_id(doc_a) == document_id(doc_b)


def test_document_id_differs_for_different_urls():
    doc_a = _doc(10)
    doc_b = doc_a.model_copy(update={"source_url": "https://example.com/other"})
    assert document_id(doc_a) != document_id(doc_b)


def test_chunk_document_splits_long_body_into_multiple_chunks():
    doc = _doc(1000)
    chunks = chunk_document(doc)
    assert len(chunks) > 1
    assert all(c.doc_id == document_id(doc) for c in chunks)
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))


def test_chunk_document_single_chunk_for_short_body():
    doc = _doc(50)
    chunks = chunk_document(doc)
    assert len(chunks) == 1
    assert chunks[0].text == doc.body_markdown


def test_embed_chunks_fills_embedding_field():
    doc = _doc(50)
    chunks = chunk_document(doc)
    embedded = embed_chunks(chunks, embedder=lambda text: [float(len(text))])
    assert all(c.embedding is not None for c in embedded)
    # Original chunks are untouched (model_copy, not mutation).
    assert chunks[0].embedding is None


def test_write_chunks_requires_embeddings_first():
    doc = _doc(50)
    chunks = chunk_document(doc)

    class FakeCollection:
        def document(self, _id):
            raise AssertionError("should not be called before embedding")

    class FakeClient:
        def collection(self, _name):
            return FakeCollection()

    try:
        write_chunks(chunks, firestore_client=FakeClient())
    except ValueError as exc:
        assert "embedding" in str(exc)
    else:
        raise AssertionError("expected ValueError for un-embedded chunks")


def test_write_chunks_writes_each_embedded_chunk():
    doc = _doc(50)
    chunks = embed_chunks(chunk_document(doc), embedder=lambda t: [0.1])

    written = {}

    class FakeDocRef:
        def __init__(self, doc_id):
            self.doc_id = doc_id

        def set(self, data):
            written[self.doc_id] = data

    class FakeCollection:
        def document(self, doc_id):
            return FakeDocRef(doc_id)

    class FakeClient:
        def collection(self, name):
            assert name == "kb_chunks"
            return FakeCollection()

    write_chunks(chunks, firestore_client=FakeClient())
    assert len(written) == len(chunks)
    first_key = f"{document_id(doc)}-0"
    assert written[first_key]["embedding"] == [0.1]
