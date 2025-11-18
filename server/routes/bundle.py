from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from server.bundles import CourseBundle, get_bundle
from server.config.bundle_config import get_bundle_ttl, is_bundle_enabled

router = APIRouter(tags=["bundle"])


def _bundle_to_dict(bundle: CourseBundle) -> dict:
    if hasattr(bundle, "model_dump"):
        return bundle.model_dump()
    return bundle.dict()


def _compute_etag(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(canonical).hexdigest()[:16]


@router.post("/bundle/course/{course_id}", response_model=CourseBundle)
@router.get(
    "/bundle/course/{course_id}",
    response_model=CourseBundle,
    include_in_schema=False,
)
async def bundle_course(course_id: str, request: Request) -> JSONResponse:
    remote_config = getattr(getattr(request, "state", object()), "remote_config", None)
    if not is_bundle_enabled(remote_config):
        raise HTTPException(status_code=404, detail="bundle disabled")

    bundle = get_bundle(course_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Unknown course_id")

    payload = _bundle_to_dict(bundle)
    ttl = get_bundle_ttl(remote_config)
    etag = _compute_etag(payload)

    headers = {
        "ETag": f'W/"{etag}"',
        "Cache-Control": f"public, max-age={ttl}",
    }
    return JSONResponse(payload, headers=headers)


__all__ = ["router"]
