from __future__ import annotations

from typing import TypedDict

from server.rounds.recap import CATEGORY_LABELS

from .drills import DRILL_CATALOG, Drill, DrillCategory


class PracticePlan(TypedDict):
    focus_categories: list[DrillCategory]
    drills: list[Drill]


def _grade_score(grade: str | None) -> int:
    order = {"A": 4, "B": 3, "C": 2, "D": 1}
    if grade is None:
        return 5
    base = grade.replace("+", "")
    return order.get(base, 5)


def _category_from_hint(hint: str) -> DrillCategory | None:
    text = hint.lower()
    if "putt" in text:
        return "putting"
    if "short" in text or "up and down" in text or "wedge" in text:
        return "short_game"
    if "approach" in text or "gir" in text or "distance control" in text:
        return "approach"
    if "drive" in text or "fairway" in text or "tee" in text:
        return "driving"
    return None


def _select_focus_categories(
    weekly_summary: dict, strokes_gained: dict | None
) -> list[DrillCategory]:
    focus: list[DrillCategory] = []

    # Use strokes gained values if available
    if strokes_gained and strokes_gained.get("categories"):
        ranked = sorted(
            (
                (cat, data.get("value", 0.0))
                for cat, data in strokes_gained.get("categories", {}).items()
                if cat in CATEGORY_LABELS
            ),
            key=lambda item: item[1],
        )
        for cat, _ in ranked:
            if cat not in focus:
                focus.append(cat)  # type: ignore[arg-type]

    # Use weakest grades from weekly summary categories
    categories = weekly_summary.get("categories", {}) if weekly_summary else {}
    ranked_grades = sorted(
        (
            (
                cat,
                _grade_score(data.get("grade")),
            )
            for cat, data in categories.items()
            if cat in CATEGORY_LABELS
        ),
        key=lambda item: item[1],
    )
    for cat, _ in ranked_grades:
        if cat not in focus:
            focus.append(cat)  # type: ignore[arg-type]

    # Map focus hints to categories
    for hint in weekly_summary.get("focus_hints", []):
        mapped = _category_from_hint(hint)
        if mapped and mapped not in focus:
            focus.append(mapped)

    if not focus:
        return ["driving", "approach", "short_game", "putting"]

    return focus  # type: ignore[return-value]


def _pick_drills_for_category(
    category: DrillCategory,
    used_ids: set[str],
    remaining_minutes: int,
    max_take: int,
) -> list[Drill]:
    candidates = [
        d
        for d in DRILL_CATALOG
        if d["category"] == category and d["id"] not in used_ids
    ]
    # Prefer shorter/easier drills first to fit time
    candidates.sort(key=lambda d: (d["difficulty"], d["duration_minutes"]))
    selected: list[Drill] = []
    total = 0
    for drill in candidates:
        if len(selected) >= max_take:
            break
        if total + drill["duration_minutes"] > remaining_minutes and selected:
            continue
        selected.append(drill)
        total += drill["duration_minutes"]
    return selected


def build_practice_plan(
    weekly_summary: dict,
    strokes_gained: dict | None = None,
    max_minutes: int = 60,
    max_drills: int = 4,
) -> PracticePlan:
    focus_categories = _select_focus_categories(weekly_summary, strokes_gained)

    drills: list[Drill] = []
    used_ids: set[str] = set()
    remaining = max_minutes

    for idx, category in enumerate(focus_categories):
        if len(drills) >= max_drills:
            break
        target = 2 if idx == 0 else 1
        slots = min(target, max_drills - len(drills))
        picked = _pick_drills_for_category(category, used_ids, remaining, slots)
        for drill in picked:
            drills.append(drill)
            used_ids.add(drill["id"])
            remaining = max(0, remaining - drill["duration_minutes"])

    # If we couldn't fill anything (e.g., no overlap with catalog), fall back to balanced
    if not drills:
        for category in ["driving", "approach", "short_game", "putting"]:
            if len(drills) >= max_drills:
                break
            picked = _pick_drills_for_category(category, used_ids, remaining, 1)
            for drill in picked:
                drills.append(drill)
                used_ids.add(drill["id"])
                remaining = max(0, remaining - drill["duration_minutes"])

    return {
        "focus_categories": focus_categories[:4],
        "drills": drills,
    }


__all__ = ["PracticePlan", "build_practice_plan"]
