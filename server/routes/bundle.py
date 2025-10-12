from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Mapping, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response

from server.config.bundle_config import get_bundle_ttl, is_bundle_enabled
from server.routes import course_bundle as legacy_course_bundle

router = APIRouter(prefix="/bundle", tags=["bundle"])

COURSE_BUNDLE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "courses"
BUNDLE_ACCEPT_MIME = "application/vnd.golfiq.bundle+json"
_SAFE_COURSE_ID = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$")


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


def _accepts_new_contract(request: Request) -> bool:
    accept = request.headers.get("accept")
    if not accept:
        return False
    for token in accept.split(","):
        media_type = token.split(";", 1)[0].strip().lower()
        if media_type == BUNDLE_ACCEPT_MIME:
            return True
    return False


def _bundle_path(course_id: str) -> Optional[Path]:
    if not _SAFE_COURSE_ID.match(course_id):
        return None
    root = COURSE_BUNDLE_DIR.resolve()
    candidate = (COURSE_BUNDLE_DIR / f"{course_id}.json").resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate if candidate.exists() else None


def _load_features(course_id: str) -> Any:
    path = _bundle_path(course_id)
    if path is None:
        return []
    with path.open("r", encoding="utf-8") as handle:
        try:
            payload = json.load(handle)
        except json.JSONDecodeError:
            return []
    return _normalize_features(payload)


def _cache_headers(ttl: int, etag: str) -> dict[str, str]:
    return {
        "Cache-Control": f"public, max-age={ttl}",
        "ETag": etag,
    }


@router.get("/course/{course_id}")
async def get_course_bundle(course_id: str, request: Request) -> Response:
    if not _accepts_new_contract(request):
        return await legacy_course_bundle.get_offline_course_bundle(course_id, request)

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
    etag_value = f'W/"{etag_hash}"'

    if legacy_course_bundle._if_none_match_matches(  # type: ignore[attr-defined]
        request.headers.get("if-none-match"), etag_value
    ):
        return Response(status_code=304, headers=_cache_headers(ttl, etag_value))

    return JSONResponse(content=response_payload, headers=_cache_headers(ttl, etag_value))


__all__ = ["COURSE_BUNDLE_DIR", "get_course_bundle", "router"]
