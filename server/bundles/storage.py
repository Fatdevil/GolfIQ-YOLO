from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Mapping, Optional

from .models import CourseBundle

DATA_DIR = Path(__file__).resolve().parent / "data"


def _validate_bundle(payload: Mapping[str, object]) -> CourseBundle:
    if hasattr(CourseBundle, "model_validate"):
        return CourseBundle.model_validate(payload)  # type: ignore[attr-defined]
    return CourseBundle.parse_obj(payload)  # type: ignore[attr-defined]


def _load_bundle_from_file(path: Path) -> Optional[CourseBundle]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(raw, Mapping):
        return None

    payload: Dict[str, object] = dict(raw)
    payload.setdefault("id", path.stem)
    try:
        return _validate_bundle(payload)
    except Exception:
        return None


@lru_cache()
def _load_all_bundles() -> Dict[str, CourseBundle]:
    bundles: Dict[str, CourseBundle] = {}
    if not DATA_DIR.exists():
        return bundles

    for bundle_path in sorted(DATA_DIR.glob("*.json")):
        bundle = _load_bundle_from_file(bundle_path)
        if bundle is None:
            continue
        bundles[bundle.id] = bundle
    return bundles


HERO_COURSES: Dict[str, CourseBundle] = _load_all_bundles()


def list_bundles() -> list[CourseBundle]:
    return list(HERO_COURSES.values())


def get_bundle(course_id: str) -> Optional[CourseBundle]:
    return HERO_COURSES.get(course_id)


__all__ = ["HERO_COURSES", "get_bundle", "list_bundles"]
