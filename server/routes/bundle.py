from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from server.config.bundle_config import get_bundle_ttl, is_bundle_enabled

router = APIRouter(prefix="/bundle", tags=["bundle"])

COURSE_BUNDLE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "courses"


def _normalize_features(data: Any) -> Any:
    if isinstance(data, Mapping):
        features = data.get("features")
        if isinstance(features, (list, dict)):
            return features
        if features is None:
            return data
    if isinstance(data, list):
        return data
    return []


def _load_features(course_id: str) -> Any:
    path = COURSE_BUNDLE_DIR / f"{course_id}.json"
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        try:
            payload = json.load(handle)
        except json.JSONDecodeError:
            return []
    return _normalize_features(payload)


@router.get("/course/{course_id}")
async def get_course_bundle(course_id: str, request: Request) -> JSONResponse:
    if not is_bundle_enabled(request):
        raise HTTPException(status_code=404, detail="bundle unavailable")

    ttl = get_bundle_ttl(request)
    features = _load_features(course_id)

    response_payload = {
        "courseId": course_id,
        "version": 1,
        "ttlSec": ttl,
        "features": features,
    }

    serialized = json.dumps(response_payload, sort_keys=True, separators=(",", ":"))
    etag_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:16]
    headers = {
        "Cache-Control": f"public, max-age={ttl}",
        "ETag": f'W/"{etag_hash}"',
    }

    return JSONResponse(content=response_payload, headers=headers)


__all__ = ["COURSE_BUNDLE_DIR", "get_course_bundle", "router"]
