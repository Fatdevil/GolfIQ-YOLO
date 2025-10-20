from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Tuple

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pydantic.config import ConfigDict

from ..security import require_api_key
from ..storage.s3signer import get_presigned_put
from ..storage.runs import RunRecord, load_run

router = APIRouter(
    prefix="/runs", tags=["runs"], dependencies=[Depends(require_api_key)]
)


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


def _runs_root() -> Path:
    root = Path(os.getenv("RUNS_DATA_DIR", "data/runs")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _by_id_dir() -> Path:
    directory = (_runs_root() / "by_id").resolve()
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _shared_path(run_id: str) -> Path:
    cleaned = run_id.strip()
    if not cleaned or any(token in cleaned for token in {"..", "/", "\\"}):
        raise HTTPException(status_code=404, detail="run not found")
    candidate = (_by_id_dir() / f"{cleaned}.json").resolve()
    by_id = _by_id_dir()
    if not str(candidate).startswith(str(by_id)):
        raise HTTPException(status_code=404, detail="run not found")
    return candidate


def _extract_device(payload: Any, depth: int = 0) -> str:
    if depth > 4 or payload is None:
        return ""
    if isinstance(payload, dict):
        keys = ("device", "device_id", "deviceId", "model", "deviceModel")
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for nested_key in ("meta", "session", "device", "context"):
            if nested_key in payload:
                candidate = _extract_device(payload[nested_key], depth + 1)
                if candidate:
                    return candidate
    if isinstance(payload, list):
        for item in payload[:5]:
            candidate = _extract_device(item, depth + 1)
            if candidate:
                return candidate
    return ""


def _make_share_id(kind: str, device_hint: str | None) -> str:
    slug_hint = _slug(device_hint) if device_hint else ""
    hint_part = slug_hint.split("-")[0][:6] if slug_hint else ""
    digest = hashlib.sha1(
        f"{kind}:{device_hint or ''}:{time.time()}:{uuid.uuid4().hex}".encode("utf-8")
    ).hexdigest()[:12]
    parts = [kind]
    if hint_part:
        parts.append(hint_part)
    parts.append(digest)
    return "-".join(part for part in parts if part)


def _append_jsonl(kind: str, run_id: str, device: str | None, size: int) -> None:
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    path = (_runs_root() / kind / f"{day}.jsonl").resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "id": run_id,
        "kind": kind,
        "device": device or None,
        "created_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "url": f"/runs/{run_id}",
        "size": size,
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _store_shared_run(kind: str, payload: Any) -> Dict[str, str]:
    device_hint = _extract_device(payload)
    run_id = _make_share_id(kind, device_hint)
    try:
        content = json.dumps(payload, ensure_ascii=False)
    except TypeError as exc:  # pragma: no cover - FastAPI should prevent this
        raise HTTPException(status_code=400, detail="payload must be JSON") from exc

    target = _shared_path(run_id)
    tmp_path = target.with_suffix(".json.tmp")
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.replace(target)

    _append_jsonl(kind, run_id, device_hint or None, len(content.encode("utf-8")))
    return {"id": run_id, "url": f"/runs/{run_id}"}


def _load_shared_payload(run_id: str) -> Tuple[str, str] | None:
    path = _shared_path(run_id)
    if not path.exists():
        return None
    data = path.read_bytes()
    etag = hashlib.sha1(data).hexdigest()
    return data.decode("utf-8"), etag


def _format_run_record(record: RunRecord) -> Dict[str, Any]:
    return {
        "run_id": record.run_id,
        "created_ts": record.created_ts,
        "source": record.source,
        "mode": record.mode,
        "params": record.params,
        "metrics": record.metrics,
        "events": record.events,
        "impact_preview": record.impact_preview,
    }


def _etag_header(value: str) -> str:
    quoted = value.strip('"')
    return f'"{quoted}"'


def _etag_matches(header: str | None, etag: str) -> bool:
    if not header:
        return False
    tokens = [token.strip() for token in header.split(",") if token.strip()]
    for token in tokens:
        if token == "*":
            return True
        cleaned = token.strip('"')
        if cleaned == etag:
            return True
    return False


@router.post("/hud")
async def upload_hud_run_json(payload: Any = Body(...)) -> Dict[str, str]:
    if not isinstance(payload, list) or len(payload) == 0:
        raise HTTPException(status_code=400, detail="hud run must be a JSON array")
    return _store_shared_run("hud", payload)


@router.post("/round")
async def upload_round_run_json(payload: Any = Body(...)) -> Dict[str, str]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="round run must be a JSON object")
    holes = payload.get("holes")
    if holes is not None and not isinstance(holes, list):
        raise HTTPException(status_code=400, detail="round run holes must be a list")
    return _store_shared_run("round", payload)


@router.get("/{run_id}")
async def get_shared_run(run_id: str, request: Request):
    shared = _load_shared_payload(run_id)
    if shared:
        content, etag = shared
        if _etag_matches(request.headers.get("if-none-match"), etag):
            return Response(status_code=304)
        return Response(
            content=content,
            media_type="application/json",
            headers={"ETag": _etag_header(etag)},
        )

    record = load_run(run_id)
    if not record:
        raise HTTPException(status_code=404, detail="run not found")
    return _format_run_record(record)


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
async def upload_run(
    key: str = Form(...), file: UploadFile = File(...)
) -> Dict[str, Any]:
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
