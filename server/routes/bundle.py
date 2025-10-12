from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from server.config import bundle_config

router = APIRouter(prefix="/bundle", tags=["bundle"])


def _course_data_root() -> Path:
    override = os.getenv("BUNDLE_DATA_DIR")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "data" / "courses"


def _resolve_course_path(course_id: str) -> Path:
    return _course_data_root() / f"{course_id}.json"


def _coerce_feature_payload(payload: Any) -> List[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        features = payload.get("features")
        if isinstance(features, list):
            return features
        typed: List[Dict[str, Any]] = []
        for key in ("fairways", "greens", "bunkers", "hazards"):
            value = payload.get(key)
            if isinstance(value, list):
                typed.append({"type": key, "features": value})
        if typed:
            return typed
    return []


def _load_features(course_id: str) -> List[Any]:
    path = _resolve_course_path(course_id)
    try:
        raw = path.read_text()
    except FileNotFoundError:
        return []
    except OSError:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return _coerce_feature_payload(data)


def _hash_payload(payload: Dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return digest[:16]


@router.get("/course/{course_id}")
async def get_bundle(course_id: str) -> JSONResponse:
    if not bundle_config.bundle_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="bundle disabled")

    ttl = max(0, bundle_config.get_bundle_ttl())
    features = _load_features(course_id)

    payload: Dict[str, Any] = {
        "courseId": course_id,
        "version": 1,
        "ttlSec": ttl,
        "features": features,
    }

    etag = _hash_payload(payload)
    response = JSONResponse(payload)
    response.headers["ETag"] = f'W/"{etag}"'
    response.headers["Cache-Control"] = f"public, max-age={ttl}"
    return response


__all__ = ["router"]
