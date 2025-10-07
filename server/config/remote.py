from __future__ import annotations

import hashlib
import json
import os
import threading
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from fastapi import APIRouter, HTTPException, Request, Response, status

DEFAULT_REMOTE_CONFIG: Dict[str, Dict[str, Any]] = {
    "tierA": {
        "hudEnabled": True,
        "inputSize": 320,
        "analyticsEnabled": False,
        "crashEnabled": False,
        "playsLikeEnabled": False,
    },
    "tierB": {
        "hudEnabled": True,
        "inputSize": 320,
        "reducedRate": True,
        "analyticsEnabled": False,
        "crashEnabled": False,
        "playsLikeEnabled": False,
    },
    "tierC": {
        "hudEnabled": False,
        "analyticsEnabled": False,
        "crashEnabled": False,
        "playsLikeEnabled": False,
    },
}

BOOL_KEYS = {
    "hudEnabled",
    "hudTracerEnabled",
    "fieldTestMode",
    "reducedRate",
    "analyticsEnabled",
    "crashEnabled",
    "playsLikeEnabled",
}


class RemoteConfigStore:
    """Thread-safe in-memory remote configuration store."""

    def __init__(self, initial: Dict[str, Dict[str, Any]] | None = None) -> None:
        self._lock = threading.RLock()
        self._config: Dict[str, Dict[str, Any]] = deepcopy(
            initial or DEFAULT_REMOTE_CONFIG
        )
        self._etag, self._updated_at = self._compute_metadata(self._config)

    def snapshot(self) -> Tuple[Dict[str, Dict[str, Any]], str, str]:
        with self._lock:
            return deepcopy(self._config), self._etag, self._updated_at

    def update(
        self, new_config: Dict[str, Any]
    ) -> Tuple[Dict[str, Dict[str, Any]], str, str]:
        validated = self._validate(new_config)
        with self._lock:
            self._config = deepcopy(validated)
            self._etag, self._updated_at = self._compute_metadata(self._config)
            return deepcopy(self._config), self._etag, self._updated_at

    @staticmethod
    def _validate(data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        if not isinstance(data, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="remote config must be a JSON object",
            )
        validated: Dict[str, Dict[str, Any]] = {}
        for tier in ("tierA", "tierB", "tierC"):
            overrides = data.get(tier)
            if overrides is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"missing {tier} overrides",
                )
            if not isinstance(overrides, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"{tier} overrides must be a JSON object",
                )
            sanitized = deepcopy(DEFAULT_REMOTE_CONFIG.get(tier, {}))
            sanitized.update(overrides)
            for key, value in sanitized.items():
                if (
                    key in BOOL_KEYS
                    and value is not None
                    and not isinstance(value, bool)
                ):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"{tier}.{key} must be a boolean",
                    )
                if key == "inputSize" and not isinstance(value, int):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"{tier}.inputSize must be an integer",
                    )
            validated[tier] = sanitized
        return validated

    @staticmethod
    def _compute_metadata(config: Dict[str, Dict[str, Any]]) -> Tuple[str, str]:
        canonical = json.dumps(config, sort_keys=True, separators=(",", ":"))
        etag = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        updated_at = datetime.now(timezone.utc).isoformat()
        return etag, updated_at


_store = RemoteConfigStore()
router = APIRouter(prefix="/config", tags=["remote-config"])


def _require_admin(request: Request) -> None:
    expected = os.getenv("ADMIN_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="admin token not configured",
        )
    provided = request.headers.get("x-admin-token")
    if not provided or provided != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid admin token",
        )
    origin = request.headers.get("origin")
    if origin:
        base = f"{request.url.scheme}://{request.url.netloc}"
        if origin.rstrip("/") != base.rstrip("/"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="cross-origin POSTs are not permitted",
            )


@router.get("/remote")
async def get_remote_config(request: Request) -> Response:
    config, etag, updated_at = _store.snapshot()
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag}
        )
    payload = {"config": config, "etag": etag, "updatedAt": updated_at}
    body = json.dumps(payload)
    return Response(
        content=body,
        media_type="application/json",
        headers={"ETag": etag, "Cache-Control": "no-cache"},
    )


@router.post("/remote")
async def update_remote_config(request: Request) -> Response:
    _require_admin(request)
    try:
        payload = await request.json()
    except Exception as exc:  # pragma: no cover - FastAPI already validates JSON
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid json payload"
        ) from exc
    config, etag, updated_at = _store.update(payload)
    body = json.dumps({"config": config, "etag": etag, "updatedAt": updated_at})
    return Response(
        content=body,
        media_type="application/json",
        headers={"ETag": etag, "Cache-Control": "no-cache"},
    )


__all__ = ["router", "RemoteConfigStore", "DEFAULT_REMOTE_CONFIG"]
