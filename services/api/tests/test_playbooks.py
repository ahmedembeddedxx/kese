from __future__ import annotations

import pytest

from app.playbooks import PlaybookNotFoundError, PlaybookRegistry


def test_loads_fan_capacitor_playbook():
    registry = PlaybookRegistry()
    playbook = registry.get("fan-capacitor-replace")
    assert playbook["category"] == "electrical"
    assert playbook["steps"][0]["gate"] == "power_off_confirmed"


def test_unknown_playbook_raises():
    registry = PlaybookRegistry()
    with pytest.raises(PlaybookNotFoundError):
        registry.get("does-not-exist")


def test_list_for_category_includes_fan_capacitor():
    registry = PlaybookRegistry()
    electrical = registry.list_for_category("electrical")
    ids = [p["id"] for p in electrical]
    assert "fan-capacitor-replace" in ids


def test_all_playbooks_validate_against_schema():
    # Loading already validates every playbook; this just asserts it
    # doesn't raise and that we actually found at least one.
    registry = PlaybookRegistry()
    assert len(registry.all()) >= 1
