"""Structure step: turn extracted markdown/text into a `KBDocument`.

What's implemented: filling the common fields (category, source_url,
licence, retrieved_at, title, body_markdown) and two cheap, genuinely
reliable heuristics -- pulling out numbered/bulleted steps, and spotting
error codes with a regex. Brand/model/part/symptom extraction needs
either per-source parsing rules or an LLM pass and is deliberately left
`None` here rather than guessed -- see README.md.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from kb_pipeline.schema import Category, KBDocument

_STEP_LINE = re.compile(r"^\s*(?:\d+[.)]|[-*])\s+(.*\S)\s*$", re.MULTILINE)

# Matches both single-letter AC-style codes (E1, F4) and OBD-II style
# codes (P0171, C1234, B0012, U0100).
_ERROR_CODE = re.compile(r"\b([EFC][0-9]{1,2}|[PBCU][0-9]{4})\b")


def extract_steps(body_markdown: str) -> list[str]:
    return [m.group(1) for m in _STEP_LINE.finditer(body_markdown)]


def extract_error_code(text: str) -> str | None:
    match = _ERROR_CODE.search(text)
    return match.group(1) if match else None


def structure_document(
    *,
    title: str,
    body_markdown: str,
    category: Category,
    source_url: str,
    licence: str,
    language: str = "en",
) -> KBDocument:
    return KBDocument(
        category=category,
        title=title.strip(),
        body_markdown=body_markdown,
        steps=extract_steps(body_markdown),
        safety_notes=[],
        error_code=extract_error_code(title + "\n" + body_markdown),
        source_url=source_url,
        licence=licence,
        retrieved_at=datetime.now(UTC),
        language=language if language in ("en", "ur") else "en",
    )
