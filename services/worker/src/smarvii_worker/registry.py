"""Versioned sport capability registry (copied from registry/capabilities.v1.json by registry/sync.mjs)."""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

_PATH = Path(__file__).with_name("capabilities.v1.json")
AUTOMATED_STATUSES = ("experimental", "validated")


@cache
def registry() -> dict[str, Any]:
    return json.loads(_PATH.read_text(encoding="utf-8"))


def registry_version() -> str:
    return str(registry()["registry_version"])


def activity_for_template(template: str) -> dict[str, Any] | None:
    for a in registry()["activities"]:
        if a.get("drill_template") == template:
            return a
    return None


def run_record(template: str) -> dict[str, Any]:
    """What each analysis run stores so a report can always be read under the registry it was produced with."""
    a = activity_for_template(template)
    return {"version": registry_version(), "activity_id": a["id"] if a else None, "activity_status": a["status"] if a else None}


def can_analyse(template: str) -> bool:
    a = activity_for_template(template)
    return a is not None and a["status"] in AUTOMATED_STATUSES
