from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, Mapping, Optional

from .hero_models import HeroCourse, HeroCourseSummary, HeroTee

DATA_ROOT = Path(__file__).resolve().parent
COURSES_DIR = DATA_ROOT / "hero_courses"
CATALOG_PATH = DATA_ROOT / "hero_catalog.json"


class HeroCatalogEntry:
    def __init__(
        self,
        course_id: str,
        name: str,
        file: Path,
        country: str | None,
        city: str | None,
    ) -> None:
        self.id = course_id
        self.name = name
        self.country = country
        self.city = city
        self.file = file


def _load_catalog() -> dict[str, HeroCatalogEntry]:
    if not CATALOG_PATH.exists():
        return {}
    try:
        raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    courses = raw.get("courses") if isinstance(raw, Mapping) else None
    if not isinstance(courses, Iterable):
        return {}

    entries: dict[str, HeroCatalogEntry] = {}
    for item in courses:
        if not isinstance(item, Mapping):
            continue
        course_id = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        file_name = str(item.get("file") or "").strip()
        if not course_id or not name or not file_name:
            continue
        entry = HeroCatalogEntry(
            course_id=course_id,
            name=name,
            country=item.get("country") or None,
            city=item.get("city") or None,
            file=COURSES_DIR / file_name,
        )
        entries[course_id] = entry
    return entries


@lru_cache()
def _catalog_entries() -> dict[str, HeroCatalogEntry]:
    return _load_catalog()


def _validate_course(payload: Mapping[str, object]) -> HeroCourse:
    if hasattr(HeroCourse, "model_validate"):
        return HeroCourse.model_validate(payload)  # type: ignore[attr-defined]
    return HeroCourse.parse_obj(payload)  # type: ignore[attr-defined]


def load_hero_course(course_id: str) -> Optional[HeroCourse]:
    entries = _catalog_entries()
    entry = entries.get(course_id)
    if not entry or not entry.file.exists():
        return None

    try:
        raw = json.loads(entry.file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(raw, Mapping):
        return None

    payload: Dict[str, object] = dict(raw)
    payload.setdefault("id", entry.id)
    payload.setdefault("name", entry.name)
    if entry.country:
        payload.setdefault("country", entry.country)
    if entry.city:
        payload.setdefault("city", entry.city)

    try:
        return _validate_course(payload)
    except Exception:
        return None


def _aggregate_lengths(course: HeroCourse) -> dict[str, int]:
    totals: dict[str, int] = {}
    for hole in course.holes:
        for tee_id, length in hole.lengths_m.items():
            if not isinstance(length, (int, float)):
                continue
            totals[tee_id] = totals.get(tee_id, 0) + int(length)
    return totals


def _tee_summaries(course: HeroCourse) -> list[HeroTee]:
    tees = course.tees
    if tees:
        return tees
    # fallback: synthesize tees from lengths
    tee_ids = set()
    for hole in course.holes:
        tee_ids.update(hole.lengths_m.keys())
    return [HeroTee(id=tee_id, label=tee_id.title()) for tee_id in sorted(tee_ids)]


def list_hero_course_summaries() -> list[HeroCourseSummary]:
    entries = _catalog_entries()
    summaries: list[HeroCourseSummary] = []
    for course_id, entry in entries.items():
        course = load_hero_course(course_id)
        if not course:
            continue
        total_par = sum(hole.par for hole in course.holes)
        lengths = _aggregate_lengths(course)
        tees = _tee_summaries(course)
        summaries.append(
            HeroCourseSummary(
                id=course.id,
                name=course.name,
                country=course.country,
                city=course.city,
                tees=tees,
                holes=len(course.holes),
                par=total_par,
                lengthsByTee=lengths,
            )
        )
    summaries.sort(key=lambda course: course.name.lower())
    return summaries


__all__ = [
    "load_hero_course",
    "list_hero_course_summaries",
    "CATALOG_PATH",
    "COURSES_DIR",
]
