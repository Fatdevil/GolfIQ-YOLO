from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping

from fastapi import APIRouter
from fastapi.responses import JSONResponse

COURSES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "courses"
META_DIR = COURSES_DIR / "meta"
CACHE_SECONDS = 600
VERSION = 1

router = APIRouter(tags=["bundle"])


def _load_json(path: Path) -> Mapping[str, Any] | None:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, Mapping) else None


def _walk_coordinates(node: Any, bbox: List[float]) -> None:
    if isinstance(node, (list, tuple)) and node and isinstance(node[0], (int, float)):
        lon, lat = float(node[0]), float(node[1])
        if not bbox:
            bbox.extend([lon, lat, lon, lat])
        else:
            bbox[0] = min(bbox[0], lon)
            bbox[1] = min(bbox[1], lat)
            bbox[2] = max(bbox[2], lon)
            bbox[3] = max(bbox[3], lat)
    elif isinstance(node, (list, tuple)):
        for child in node:
            _walk_coordinates(child, bbox)


def _compute_bbox_from_features(features: Iterable[Mapping[str, Any]]) -> List[float]:
    bbox: List[float] = []
    for feature in features:
        geometry = feature.get("geometry") if isinstance(feature, Mapping) else None
        if not isinstance(geometry, Mapping):
            continue
        coords = geometry.get("coordinates")
        _walk_coordinates(coords, bbox)
    return bbox


def _count_feature_types(features: Iterable[Mapping[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for feature in features:
        feature_type = feature.get("type") if isinstance(feature, Mapping) else None
        if not isinstance(feature_type, str):
            continue
        key = feature_type.lower().strip()
        if not key:
            continue
        plural = f"{key}s" if not key.endswith("y") else f"{key[:-1]}ies"
        counts[plural] = counts.get(plural, 0) + 1
    return counts


def _load_metadata(course_id: str) -> Mapping[str, Any] | None:
    meta_path = META_DIR / f"{course_id}.json"
    if not meta_path.exists():
        return None
    return _load_json(meta_path)


def _isoformat_timestamp(timestamp: float) -> str:
    return (
        datetime.fromtimestamp(timestamp, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _build_course_entry(course_path: Path) -> Dict[str, Any] | None:
    payload = _load_json(course_path)
    if payload is None:
        return None
    features = payload.get("features") if isinstance(payload, Mapping) else None
    if not isinstance(features, list):
        features = []
    course_id = str(payload.get("courseId") or course_path.stem)
    metadata = _load_metadata(course_id) or {}

    bbox = metadata.get("bbox") if isinstance(metadata, Mapping) else None
    if not isinstance(bbox, list) or len(bbox) != 4:
        bbox = _compute_bbox_from_features(features)

    approx = metadata.get("approx") if isinstance(metadata, Mapping) else None
    if not isinstance(approx, Mapping) or not approx:
        approx = _count_feature_types(features)

    updated = metadata.get("updatedAt") if isinstance(metadata, Mapping) else None
    if not isinstance(updated, str):
        updated = _isoformat_timestamp(course_path.stat().st_mtime)

    entry: Dict[str, Any] = {
        "courseId": course_id,
        "bbox": bbox,
        "updatedAt": updated,
        "approx": dict(approx),
    }
    name = metadata.get("name") if isinstance(metadata, Mapping) else None
    if isinstance(name, str) and name:
        entry["name"] = name
    return entry


@router.get("/bundle/index")
async def bundle_index() -> JSONResponse:
    courses: List[Dict[str, Any]] = []
    if COURSES_DIR.exists():
        for path in sorted(COURSES_DIR.glob("*.json")):
            entry = _build_course_entry(path)
            if entry:
                courses.append(entry)
    payload = {"version": VERSION, "courses": courses}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    etag = hashlib.sha256(canonical).hexdigest()
    headers = {
        "ETag": f'"{etag}"',
        "Cache-Control": f"public, max-age={CACHE_SECONDS}",
    }
    return JSONResponse(payload, headers=headers)


__all__ = ["router"]
