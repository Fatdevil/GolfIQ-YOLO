from __future__ import annotations

import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from pydantic.config import ConfigDict

from ..security import require_api_key
from ..storage.s3signer import get_presigned_put

router = APIRouter(prefix="/runs", tags=["runs"], dependencies=[Depends(require_api_key)])


class UploadUrlRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(..., alias="runId")


def _upload_root() -> Path:
    root = Path(os.getenv("RUNS_UPLOAD_DIR", "data/uploads")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _slug(value: str) -> str:
    cleaned = [c if c.isalnum() or c in {"-", "_"} else "-" for c in value.strip()]
    slug = "".join(cleaned).strip("-_")
    return slug or "run"


def _make_key(run_id: str) -> str:
    slug = _slug(run_id)
    timestamp = int(time.time())
    suffix = uuid.uuid4().hex[:8]
    return f"{slug}/{timestamp}-{suffix}.zip"


def _resolve_path(key: str) -> Path:
    root = _upload_root()
    dest = (root / key).resolve()
    if not str(dest).startswith(str(root)):
        raise HTTPException(status_code=400, detail="invalid key")
    return dest


@router.post("/upload-url")
async def create_upload_url(payload: UploadUrlRequest) -> Dict[str, Any]:
    backend = os.getenv("STORAGE_BACKEND", "fs").strip().lower() or "fs"
    ttl_days = int(os.getenv("RUNS_TTL_DAYS", "30") or "30")
    key = _make_key(payload.run_id)

    if backend == "s3":
        presigned = get_presigned_put(key, ttl_days)
        return {
            "backend": "s3",
            "url": presigned["url"],
            "key": key,
            "ttl": ttl_days,
            "headers": presigned.get("headers"),
            "expiresAt": presigned.get("expiresAt"),
        }

    return {"backend": "fs", "formUrl": "/runs/upload", "key": key, "ttl": None}


@router.post("/upload")
async def upload_run(key: str = Form(...), file: UploadFile = File(...)) -> Dict[str, Any]:
    backend = os.getenv("STORAGE_BACKEND", "fs").strip().lower() or "fs"
    if backend != "fs":
        raise HTTPException(status_code=400, detail="filesystem backend disabled")

    dest = _resolve_path(key)
    dest.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    with dest.open("wb") as out:
        while True:
            chunk = await file.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            size += len(chunk)

    await file.close()

    return {"stored": key, "size": size}
