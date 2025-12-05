from __future__ import annotations

from typing import Iterable, List

from .drills import DRILL_CATALOG, Drill, DrillCategory


def _preferred_drills_for_category(
    category: DrillCategory, used_ids: set[str]
) -> List[Drill]:
    drills = [
        d
        for d in DRILL_CATALOG
        if d["category"] == category and d["id"] not in used_ids
    ]
    drills.sort(key=lambda d: (d["difficulty"], d["duration_minutes"]))
    return drills


def recommend_drills_for_round_summary(
    weaknesses: Iterable[DrillCategory],
    max_drills: int = 4,
) -> list[Drill]:
    """Return a small list of drills aligned to weak categories.

    Preference order:
    - Fill drills matching the provided weakness categories.
    - If we have remaining slots, fill with mixed drills.
    """

    selected: list[Drill] = []
    used_ids: set[str] = set()

    for category in weaknesses:
        for drill in _preferred_drills_for_category(category, used_ids):
            selected.append(drill)
            used_ids.add(drill["id"])
            if len(selected) >= max_drills:
                return selected

    if len(selected) < max_drills:
        for drill in _preferred_drills_for_category("mixed", used_ids):
            selected.append(drill)
            used_ids.add(drill["id"])
            if len(selected) >= max_drills:
                break

    return selected


__all__ = ["recommend_drills_for_round_summary"]
