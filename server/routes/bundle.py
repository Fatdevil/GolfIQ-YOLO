from __future__ import annotations

import hashlib

import json
from typing import Any, Dict

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from server.config.bundle_config import BundleConfig, get_bundle_config

router = APIRouter(prefix="/bundle", tags=["bundle"])


def _stable_hash(payload: Dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return digest[:16]


def _load_optional_course_data(course_id: str, config: BundleConfig) -> Dict[str, Any]:
    course_path = config.course_path(course_id)
    if not course_path.is_file():
        return {}
    try:
        raw = course_path.read_text(encoding="utf-8")
        payload = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return {}
    if isinstance(payload, dict):
        return payload
    return {}


@router.get("/course/{course_id}")
async def get_offline_bundle(course_id: str) -> JSONResponse:
    config = get_bundle_config()
    response_payload: Dict[str, Any] = {
        "courseId": course_id,
        "version": 1,
        "ttlSec": config.ttl_seconds,
        "features": list(config.default_features),
    }

    overrides = _load_optional_course_data(course_id, config)
    if overrides:
        features = overrides.get("features")
        if isinstance(features, list):
            response_payload["features"] = features
        for key, value in overrides.items():
            if key == "features":
                continue
            response_payload[key] = value

    etag = _stable_hash(response_payload)
    response = JSONResponse(response_payload)
    response.headers["ETag"] = f'W/"{etag}"'
    response.headers["Cache-Control"] = f"public, max-age={config.ttl_seconds}"
    return response


__all__ = ["router"]
