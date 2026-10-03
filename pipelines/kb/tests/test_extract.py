from __future__ import annotations

from pathlib import Path

import pytest

from kb_pipeline.extract import ExtractionError, extract_html, extract_pdf

FIXTURES = Path(__file__).parent / "fixtures"


def test_extract_html_pulls_main_content():
    html = (FIXTURES / "sample_page.html").read_text()
    markdown = extract_html(html, url="https://example.com/fan-capacitor")
    assert "ceiling fan capacitor" in markdown.lower()
    assert "Switch off the fan" in markdown
    # Nav/footer boilerplate should be stripped by trafilatura.
    assert "Copyright notice" not in markdown


def test_extract_html_raises_on_empty_page():
    with pytest.raises(ExtractionError):
        extract_html("<html><body></body></html>", url="https://example.com/empty")


def test_extract_pdf_round_trips_real_text():
    pymupdf = pytest.importorskip("pymupdf")
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Engine oil dipstick location and reading guide.")
    pdf_bytes = doc.tobytes()
    doc.close()

    text = extract_pdf(pdf_bytes, source_name="oil-guide.pdf")
    assert "dipstick" in text.lower()


def test_extract_pdf_raises_on_blank_pdf():
    pymupdf = pytest.importorskip("pymupdf")
    doc = pymupdf.open()
    doc.new_page()
    pdf_bytes = doc.tobytes()
    doc.close()

    with pytest.raises(ExtractionError):
        extract_pdf(pdf_bytes, source_name="blank.pdf")
