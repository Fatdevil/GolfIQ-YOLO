from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, NotRequired, TypedDict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from server.bundles import CourseBundle, get_bundle
from server.config.bundle_config import get_bundle_ttl, is_bundle_enabled

router = APIRouter(tags=["bundle"])

COURSES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "courses"
_VERSION = 1


class CourseFeatureGreenPin(TypedDict, total=False):
    lat: float
    lon: float
    ts: str


class CourseFeatureGreen(TypedDict, total=False):
    sections: list[str]
    fatSide: str
    pin: CourseFeatureGreenPin


class CourseFeature(TypedDict, total=False):
    id: str
    type: str
    geometry: dict[str, Any]
    properties: dict[str, Any]
    green: NotRequired[CourseFeatureGreen]


def _compute_etag(payload: Mapping[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    digest = hashlib.sha256(canonical).hexdigest()[:16]
    return digest


def _load_features(course_id: str) -> list[CourseFeature]:
    course_file = COURSES_DIR / f"{course_id}.json"
    if not course_file.exists():
        return []
    try:
        payload = json.loads(course_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    features = payload.get("features") if isinstance(payload, Mapping) else None
    if isinstance(features, list):
        return features  # type: ignore[return-value]
    return []


def _coordinates_from_polyline(
    polyline: list[tuple[float, float]],
) -> list[list[float]]:
    coordinates: list[list[float]] = []
    for lat, lon in polyline:
        coordinates.append([float(lon), float(lat)])
    return coordinates


def _hero_bundle_to_features(bundle: CourseBundle) -> list[CourseFeature]:
    features: list[CourseFeature] = []
    for hole in bundle.holes:
        properties: dict[str, Any] = {"hole": hole.hole, "par": hole.par}
        if hole.green_center:
            properties["greenCenter"] = {
                "lat": hole.green_center[0],
                "lon": hole.green_center[1],
            }
        if bundle.tees:
            properties["tees"] = list(bundle.tees)
        if hole.hazards:
            properties["hazards"] = hole.hazards

        feature: CourseFeature = {
            "id": f"hole-{hole.hole}",
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": _coordinates_from_polyline(hole.polyline),
            },
            "properties": properties,
        }
        features.append(feature)
    return features


@router.post("/bundle/course/{course_id}")
@router.get("/bundle/course/{course_id}", include_in_schema=False)
async def bundle_course(course_id: str, request: Request) -> JSONResponse:
    remote_config = getattr(getattr(request, "state", object()), "remote_config", None)
    if not is_bundle_enabled(remote_config):
        raise HTTPException(status_code=404, detail="bundle disabled")

    hero_bundle = get_bundle(course_id)
    course_features = _hero_bundle_to_features(hero_bundle) if hero_bundle else []

    if not hero_bundle:
        course_features = _load_features(course_id)

    course_file = COURSES_DIR / f"{course_id}.json"
    if not hero_bundle and not course_features and not course_file.exists():
        raise HTTPException(status_code=404, detail="Unknown course_id")

    ttl = get_bundle_ttl(remote_config)
    payload: dict[str, Any] = {
        "courseId": hero_bundle.id if hero_bundle else course_id,
        "version": _VERSION,
        "ttlSec": ttl,
        "features": course_features,
    }

    if hero_bundle:
        payload["name"] = hero_bundle.name
        if hero_bundle.country:
            payload["country"] = hero_bundle.country
        if hero_bundle.tees:
            payload["tees"] = list(hero_bundle.tees)

    etag = _compute_etag(payload)
    headers = {
        "ETag": f'W/"{etag}"',
        "Cache-Control": f"public, max-age={ttl}",
    }
    return JSONResponse(payload, headers=headers)


__all__ = ["router", "COURSES_DIR"]
