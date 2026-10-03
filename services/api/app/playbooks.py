"""Loads and validates playbooks from the repo's `playbooks/` directory.

Every playbook is validated against `playbooks/schema.json` at load time
(not just by a CI lint step) so a malformed playbook fails loudly on
startup instead of reaching a live session.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

import jsonschema

_CATEGORY_DIRS = ("electrical", "ac", "car")


def _default_playbooks_dir() -> Path:
    """Resolve the `playbooks/` directory in either layout this app runs in:

    - Local dev / CI, run from the repo checkout: `services/api/app/` is
      three levels under the repo root, so `playbooks/` is a sibling of
      `services/`.
    - The Docker image (see `services/api/Dockerfile`): the repo's
      `playbooks/` directory is copied to `/playbooks` instead, since the
      image only contains `services/api`, not the whole monorepo.

    `MEND_PLAYBOOKS_DIR` overrides both, if set.
    """
    override = os.environ.get("MEND_PLAYBOOKS_DIR")
    if override:
        return Path(override)

    here = Path(__file__).resolve()
    try:
        repo_root_candidate = here.parents[3] / "playbooks"
    except IndexError:
        repo_root_candidate = None

    for candidate in (repo_root_candidate, Path("/playbooks")):
        if candidate is not None and candidate.is_dir():
            return candidate

    # Nothing found; return the repo-layout path so the resulting error
    # (schema.json not found) points at the right place to fix.
    return repo_root_candidate or Path("playbooks")


PLAYBOOKS_DIR = _default_playbooks_dir()
SCHEMA_PATH = PLAYBOOKS_DIR / "schema.json"
GATES_PATH = PLAYBOOKS_DIR / "gates.json"


class PlaybookNotFoundError(KeyError):
    pass


class PlaybookRegistry:
    def __init__(
        self, playbooks_dir: Path = PLAYBOOKS_DIR, schema_path: Path = SCHEMA_PATH
    ) -> None:
        self._dir = playbooks_dir
        self._schema_path = schema_path
        self._by_id: dict[str, dict] | None = None

    def _load(self) -> dict[str, dict]:
        if self._by_id is not None:
            return self._by_id
        schema = json.loads(self._schema_path.read_text(encoding="utf-8"))
        by_id: dict[str, dict] = {}
        for category_dir in _CATEGORY_DIRS:
            folder = self._dir / category_dir
            if not folder.is_dir():
                continue
            for path in sorted(folder.glob("*.json")):
                data = json.loads(path.read_text(encoding="utf-8"))
                jsonschema.validate(data, schema)
                if data["id"] in by_id:
                    raise ValueError(f"Duplicate playbook id: {data['id']}")
                by_id[data["id"]] = data
        self._by_id = by_id
        return by_id

    def get(self, playbook_id: str) -> dict:
        try:
            return self._load()[playbook_id]
        except KeyError as exc:
            raise PlaybookNotFoundError(playbook_id) from exc

    def list_for_category(self, category: str) -> list[dict]:
        return [p for p in self._load().values() if p["category"] == category]

    def all(self) -> list[dict]:
        return list(self._load().values())


@lru_cache
def get_playbook_registry() -> PlaybookRegistry:
    return PlaybookRegistry()
