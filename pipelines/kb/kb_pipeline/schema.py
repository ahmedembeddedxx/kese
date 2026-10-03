"""The normalized document schema every crawled source gets structured
into (technical plan, "Structure" step), plus the source registry schema
that `sources/*.yaml` files validate against.

Every document in the knowledge base -- whatever site or PDF it came
from -- ends up as one `KBDocument`, so `structure.py`, `clean.py` and
`embed.py` never need to know where a document originally came from.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

Category = Literal["electrical", "ac", "car", "general"]


class SourceConfig(BaseModel):
    """One entry from a `sources/*.yaml` registry file.

    Per the plan: "A YAML file per source: URL patterns, category,
    licence, crawl rules, rate limit."
    """

    id: str = Field(pattern="^[a-z0-9]+(-[a-z0-9]+)*$")
    category: Category
    kind: Literal["html", "pdf"]
    start_urls: list[HttpUrl] = Field(min_length=1)
    url_patterns: list[str] = Field(
        default_factory=list,
        description="Regexes a discovered URL must match to be crawled, beyond start_urls.",
    )
    licence: str = Field(
        description="How this source may be used, e.g. 'retrieval-only, cite source'"
    )
    rate_limit_seconds: float = Field(
        default=2.0, ge=0.5, description="Minimum delay between requests"
    )
    max_pages: int = Field(default=500, ge=1, le=20_000)
    notes: str | None = None


class KBDocument(BaseModel):
    """The normalized schema every crawled page/PDF becomes, per the
    plan: "category, device_type, brand, model, part, symptom,
    error_code, steps, safety_notes, source_url, licence, retrieved_at."
    """

    category: Category
    device_type: str | None = None
    brand: str | None = None
    model: str | None = None
    part: str | None = None
    symptom: str | None = None
    error_code: str | None = None
    title: str
    body_markdown: str = Field(min_length=1)
    steps: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    source_url: str
    licence: str
    retrieved_at: datetime
    language: Literal["en", "ur"] = "en"


class KBChunk(BaseModel):
    """One ~500-token slice of a `KBDocument`, ready to embed and store
    in `kb_chunks` (see services/api/app/services/kb_store.py)."""

    doc_id: str
    chunk_index: int
    text: str = Field(min_length=1)
    category: Category
    brand: str | None = None
    model: str | None = None
    title: str
    source_url: str
    licence: str
    embedding: list[float] | None = None
