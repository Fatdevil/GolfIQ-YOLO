from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from server.bundles import list_bundles
from server.config.bundle_config import get_bundle_ttl, is_bundle_enabled

router = APIRouter(tags=["bundle"])


class BundleIndexItem(BaseModel):
    id: str
    courseId: str
    name: str
    holes: int
    country: str | None = None
    tees: list[str] = Field(default_factory=list)


def _compute_etag(payload: list[dict]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(canonical).hexdigest()[:16]


@router.get("/bundle/index", response_model=list[BundleIndexItem])
async def bundle_index(request: Request) -> JSONResponse:
    remote_config = getattr(getattr(request, "state", object()), "remote_config", None)
    if not is_bundle_enabled(remote_config):
        raise HTTPException(status_code=404, detail="bundle disabled")

    bundles = list_bundles()
    payload = [
        {
            "id": bundle.id,
            "courseId": bundle.id,
            "name": bundle.name,
            "holes": len(bundle.holes),
            "country": bundle.country,
            "tees": bundle.tees,
        }
        for bundle in bundles
    ]
    ttl = get_bundle_ttl(remote_config)
    etag = _compute_etag(payload)
    headers = {
        "ETag": f'"{etag}"',
        "Cache-Control": f"public, max-age={ttl}",
    }
    return JSONResponse(payload, headers=headers)


__all__ = ["router"]
