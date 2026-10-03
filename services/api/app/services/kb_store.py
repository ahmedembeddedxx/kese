"""Knowledge-base vector search over Firestore (`kb_chunks` collection,
populated by `pipelines/kb`, see that package's README).

Honesty rule: an empty `results` list must only ever mean "the KB really
has nothing relevant for this query", never "we couldn't reach the
database" or "the KB hasn't been crawled yet". Those two are distinct
failures and are raised as `KBStoreUnavailable` so the router can return a
503 instead of a misleadingly empty 200 -- a user who sees "no results"
should be able to trust that, not wonder if the backend just broke.
"""

from __future__ import annotations

from app.models import Category, KBResult


class KBStoreUnavailable(RuntimeError):
    """Raised when the KB collection can't be queried at all (connection
    failure, missing vector index, or the collection not seeded yet by
    the crawl pipeline). Distinct from a legitimate zero-result search.
    """


class KBStore:
    COLLECTION = "kb_chunks"

    def __init__(self, client) -> None:
        self._client = client

    def search(
        self, *, query_embedding: list[float], category: Category | None, limit: int
    ) -> list[KBResult]:
        try:
            from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
            from google.cloud.firestore_v1.vector import Vector

            collection = self._client.collection(self.COLLECTION)
            query = collection
            if category:
                query = query.where("category", "==", category)
            vector_query = query.find_nearest(
                vector_field="embedding",
                query_vector=Vector(query_embedding),
                distance_measure=DistanceMeasure.COSINE,
                limit=limit,
            )
            docs = list(vector_query.stream())
        except Exception as exc:  # noqa: BLE001 - any failure here is "KB unavailable"
            raise KBStoreUnavailable(str(exc)) from exc

        return [_doc_to_result(doc.id, doc.to_dict()) for doc in docs]


def _doc_to_result(doc_id: str, data: dict) -> KBResult:
    return KBResult(
        doc_id=doc_id,
        title=data.get("title", ""),
        snippet=data.get("snippet", ""),
        category=data.get("category", "general"),
        brand=data.get("brand"),
        model=data.get("model"),
        source_url=data.get("source_url", ""),
        licence=data.get("licence"),
        score=float(data.get("score", 0.0)),
    )
