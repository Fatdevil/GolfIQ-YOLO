from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response


router = APIRouter(tags=["models"])

_CACHE_CONTROL_HEADER = "public, max-age=3600"


def _default_manifest_path() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "models" / "manifest.json"


def _manifest_path() -> Path:
    override = os.getenv("MODEL_MANIFEST_PATH")
    if override:
        return Path(override)
    return _default_manifest_path()


def _load_manifest_bytes(path: Path) -> bytes:
    try:
        payload = path.read_bytes()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="manifest not found") from exc
    except OSError as exc:  # pragma: no cover - defensive branch
        raise HTTPException(status_code=500, detail="unable to read manifest") from exc
    try:
        json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="invalid manifest payload") from exc
    return payload


def _compute_etag(payload: bytes) -> str:
    digest = hashlib.sha256(payload).hexdigest()
    return f'"{digest}"'


def _matches_if_none_match(header_value: str | None, etag: str) -> bool:
    if not header_value:
        return False
    candidates = [value.strip() for value in header_value.split(",") if value.strip()]
    return any(candidate in {etag, f"W/{etag}"} for candidate in candidates)


@router.get("/models/manifest.json")
async def get_model_manifest(request: Request) -> Response:
    path = _manifest_path().resolve()
    payload = _load_manifest_bytes(path)
    etag = _compute_etag(payload)
    headers = {"ETag": etag, "Cache-Control": _CACHE_CONTROL_HEADER}
    if _matches_if_none_match(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)
    return Response(content=payload, media_type="application/json", headers=headers)


__all__ = ["router"]
