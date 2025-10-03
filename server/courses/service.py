from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, Iterable, List

from .schema import CourseBundle, Feature, Hole, PointGeometry, PolygonGeometry

DATA_ROOT = Path(__file__).resolve().parents[2] / "data" / "courses"
DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


class CourseBundleNotFoundError(FileNotFoundError):
    """Raised when a requested course bundle does not exist."""


def _iter_course_files(course_dir: Path) -> Iterable[Path]:
    for path in sorted(course_dir.rglob("*")):
        if path.is_file() and path.suffix.lower() in {".geojson", ".json"}:
            yield path


def _compute_etag(course_dir: Path) -> str:
    hasher = hashlib.sha256()
    for file_path in _iter_course_files(course_dir):
        relative = file_path.relative_to(course_dir)
        stat = file_path.stat()
        hasher.update(str(relative).encode("utf-8"))
        hasher.update(str(stat.st_mtime_ns).encode("utf-8"))
        hasher.update(str(stat.st_size).encode("utf-8"))
    return hasher.hexdigest()


def _load_feature(feature_data: Dict) -> Feature:
    geometry = feature_data.get("geometry") or {}
    geometry_type = geometry.get("type")
    if geometry_type == "Point":
        geom = PointGeometry(coordinates=tuple(geometry.get("coordinates", (0.0, 0.0))))
    elif geometry_type == "Polygon":
        coords = geometry.get("coordinates", [])
        rings: List[List[tuple]] = []
        for ring in coords:
            rings.append([tuple(point) for point in ring])
        geom = PolygonGeometry(coordinates=rings)
    else:
        raise ValueError(f"Unsupported geometry type: {geometry_type}")

    return Feature(
        id=str(feature_data.get("id")),
        geometry=geom,
        properties=feature_data.get("properties", {}),
    )


def _load_hole(course_dir: Path, hole_file: Path, hole_meta: Dict[str, Dict]) -> Hole:
    with hole_file.open("r", encoding="utf-8") as fp:
        payload = json.load(fp)

    hole_number_str = hole_file.stem.split("_")[-1]
    try:
        number = int(hole_number_str)
    except ValueError as exc:  # pragma: no cover - guardrail
        raise ValueError(f"Invalid hole filename: {hole_file.name}") from exc

    features = [_load_feature(feature) for feature in payload.get("features", [])]

    metadata = hole_meta.get(str(number), {})
    return Hole(
        number=number,
        name=metadata.get("name"),
        par=metadata.get("par"),
        yardage=metadata.get("yardage"),
        features=features,
    )


def load_bundle(course_id: str) -> CourseBundle:
    """Load a course bundle from file-backed GeoJSON features."""

    course_dir = DATA_ROOT / course_id
    if not course_dir.exists() or not course_dir.is_dir():
        raise CourseBundleNotFoundError(course_id)

    course_meta_path = course_dir / "course.json"
    course_meta: Dict = {}
    if course_meta_path.exists():
        with course_meta_path.open("r", encoding="utf-8") as fp:
            course_meta = json.load(fp)

    hole_meta: Dict[str, Dict] = course_meta.get("holes", {}) if isinstance(course_meta, dict) else {}

    holes: List[Hole] = []
    for hole_file in sorted(course_dir.glob("hole_*.geojson")):
        holes.append(_load_hole(course_dir, hole_file, hole_meta))

    bundle = CourseBundle(
        id=course_meta.get("id", course_id),
        name=course_meta.get("name"),
        holes=holes,
        ttl_seconds=DEFAULT_TTL_SECONDS,
        etag=_compute_etag(course_dir),
    )
    return bundle
