from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query

from server.services import media_signer
from server.utils.media import rewrite_media_url

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/sign")
def sign_media(
    path: str = Query(..., min_length=1), ttl: int = Query(900)
) -> Dict[str, Any]:
    key = os.getenv("HLS_SIGN_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="signing disabled")

    normalized_path = path if path.startswith("/") else f"/{path}"

    try:
        signed = media_signer.sign(normalized_path, key, ttl)
    except AssertionError as exc:  # pragma: no cover - transformed to HTTP error below
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    base = os.getenv("HLS_BASE_URL", "/static")
    url = media_signer.build_url(base, signed)
    rewritten = rewrite_media_url(url) or url
    return {"url": rewritten, "exp": signed["exp"]}
