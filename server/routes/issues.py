from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from ..security import require_api_key

router = APIRouter(
    prefix="/issues", tags=["issues"], dependencies=[Depends(require_api_key)]
)


def _issues_root() -> Path:
    base = Path(os.getenv("ISSUES_DATA_DIR", "data/issues")).resolve()
    base.mkdir(parents=True, exist_ok=True)
    return base


def _day_path(day: datetime) -> Path:
    root = _issues_root()
    filename = f"{day.strftime('%Y-%m-%d')}.jsonl"
    return (root / filename).resolve()


def _append_issue(record: Dict[str, Any]) -> None:
    now = datetime.now(timezone.utc)
    path = _day_path(now)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def _load_issue(issue_id: str) -> Dict[str, Any] | None:
    root = _issues_root()
    if not root.exists():
        return None
    for path in sorted(root.glob("*.jsonl")):
        try:
            with path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(data, dict) and data.get("issue_id") == issue_id:
                        return data
        except FileNotFoundError:
            continue
    return None


@router.post("", status_code=201)
async def create_issue(payload: Dict[str, Any]) -> Dict[str, str]:
    issue_id = uuid4().hex
    record = {
        "issue_id": issue_id,
        "received_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "payload": payload,
    }
    _append_issue(record)
    return {"id": issue_id}


@router.get("/{issue_id}")
async def read_issue(issue_id: str) -> Dict[str, Any]:
    record = _load_issue(issue_id)
    if not record:
        raise HTTPException(status_code=404, detail="issue not found")
    return record
