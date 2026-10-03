"""Extract step: HTML to clean markdown (trafilatura), PDFs to text
(PyMuPDF), per the plan's pipeline.

Scanned manuals and wiring diagrams that need a vision model to describe
(the plan's "Flash-Lite model that returns text, tables and a description
of each diagram") are not implemented here yet -- `extract_pdf` returns
whatever text layer the PDF has, which is empty for a pure scan. See
README.md "What's implemented vs stubbed".
"""

from __future__ import annotations

import trafilatura


class ExtractionError(RuntimeError):
    pass


def extract_html(html: str, *, url: str) -> str:
    """Return clean markdown for one HTML page, or raise if trafilatura
    found nothing worth keeping (e.g. a near-empty or boilerplate-only
    page)."""
    markdown = trafilatura.extract(
        html,
        url=url,
        output_format="markdown",
        include_tables=True,
        include_links=False,
        favor_precision=True,
    )
    if not markdown or not markdown.strip():
        raise ExtractionError(f"No extractable content found at {url}")
    return markdown.strip()


def extract_pdf(pdf_bytes: bytes, *, source_name: str) -> str:
    """Return the text layer of a PDF, page by page, joined with blank
    lines. Raises if the PDF has no extractable text (e.g. it's a scan
    with no OCR layer) -- that case needs the vision-model fallback noted
    in this module's docstring, not silently returning an empty document.
    """
    import pymupdf

    try:
        document = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 - any PyMuPDF failure means "can't extract"
        raise ExtractionError(f"Could not open PDF {source_name}: {exc}") from exc

    pages = [page.get_text().strip() for page in document]
    document.close()
    text = "\n\n".join(p for p in pages if p)
    if not text.strip():
        raise ExtractionError(
            f"No text layer found in {source_name} (likely a scan needing OCR/vision extraction)"
        )
    return text
