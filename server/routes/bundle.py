from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, NotRequired, TypedDict

try:  # Python 3.11+
    from typing import Literal
except ImportError:  # pragma: no cover - fallback for older runtimes
    from typing_extensions import Literal  # type: ignore

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from server.config.bundle_config import get_bundle_ttl, is_bundle_enabled

router = APIRouter(tags=["bundle"])

COURSES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "courses"
_VERSION = 1


class CourseFeatureGreen(TypedDict, total=False):
    sections: list[Literal["front", "middle", "back"]]
    fatSide: Literal["L", "R"]


class CourseFeature(TypedDict, total=False):
    id: str
    type: str
    geometry: dict[str, Any]
    green: NotRequired[CourseFeatureGreen]


class CourseBundlePayload(TypedDict):
    courseId: str
    version: int
    ttlSec: int
    features: list[CourseFeature]


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


def _compute_etag(payload: Mapping[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    digest = hashlib.sha256(canonical).hexdigest()[:16]
    return digest


@router.get("/bundle/course/{course_id}")
async def get_course_bundle(course_id: str, request: Request) -> JSONResponse:
    remote_config = getattr(getattr(request, "state", object()), "remote_config", None)
    if not is_bundle_enabled(remote_config):
        raise HTTPException(status_code=404, detail="bundle disabled")

    ttl = get_bundle_ttl(remote_config)
    features = _load_features(course_id)
    payload: CourseBundlePayload = {
        "courseId": course_id,
        "version": _VERSION,
        "ttlSec": ttl,
        "features": features,
    }
    etag = _compute_etag(payload)
    headers = {
        "ETag": f'W/"{etag}"',
        "Cache-Control": f"public, max-age={ttl}",
    }
    return JSONResponse(payload, headers=headers)


__all__ = ["router"]
