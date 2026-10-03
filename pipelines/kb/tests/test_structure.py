from __future__ import annotations

from kb_pipeline.structure import extract_error_code, extract_steps, structure_document


def test_extract_steps_handles_numbered_and_bulleted_lists():
    markdown = (
        "1. Switch off the breaker.\n"
        "2. Open the canopy.\n"
        "- Discharge the capacitor.\n"
        "* Replace it with a matching one.\n"
    )
    steps = extract_steps(markdown)
    assert steps == [
        "Switch off the breaker.",
        "Open the canopy.",
        "Discharge the capacitor.",
        "Replace it with a matching one.",
    ]


def test_extract_steps_empty_for_prose():
    assert extract_steps("Just a paragraph with no list items at all.") == []


def test_extract_error_code_finds_ac_style_code():
    assert extract_error_code("The unit displays F3 when the sensor fails.") == "F3"


def test_extract_error_code_finds_obd_style_code():
    assert extract_error_code("Scan tool reads P0171 for lean fuel mixture.") == "P0171"


def test_extract_error_code_none_when_absent():
    assert extract_error_code("No codes mentioned in this guide.") is None


def test_structure_document_builds_full_kbdocument():
    doc = structure_document(
        title="Fan capacitor guide",
        body_markdown="1. Switch off the breaker.\n2. Replace the capacitor.",
        category="electrical",
        source_url="https://example.com/fan-capacitor",
        licence="retrieval-only, cite source",
    )
    assert doc.category == "electrical"
    assert doc.steps == ["Switch off the breaker.", "Replace the capacitor."]
    assert doc.language == "en"
    assert doc.retrieved_at is not None
