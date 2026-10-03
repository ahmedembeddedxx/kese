"""Loads and validates `playbooks/gates.json`, the shared bilingual safety-
gate catalogue referenced by a playbook step's `gate` field and served to
the frontend via `/gates` so it has exactly one source of truth.
"""

from __future__ import annotations

import json
from functools import lru_cache

from app.models import Gate
from app.playbooks import GATES_PATH


@lru_cache
def get_gates() -> dict[str, Gate]:
    data = json.loads(GATES_PATH.read_text(encoding="utf-8"))
    return {gate_id: Gate(**fields) for gate_id, fields in data["gates"].items()}
