"""Run score event ingestion endpoints."""

from __future__ import annotations

import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from server.security import require_api_key


router = APIRouter(
    prefix="/api/runs",
    tags=["run-score"],
    dependencies=[Depends(require_api_key)],
)


class ScoreEventBody(BaseModel):
    dedupeKey: str = Field(..., alias="dedupeKey")
    ts: float = Field(..., ge=0)
    kind: str
    payload: Dict[str, Any] = Field(default_factory=dict)


_RECORDED_EVENTS: dict[str, dict[str, Dict[str, Any]]] = {}


@router.post("/{run_id}/score", status_code=status.HTTP_200_OK)
def submit_score_event(run_id: str, body: ScoreEventBody) -> Dict[str, str]:
    """Record a score event with idempotency handling."""

    dedupe_key = body.dedupeKey.strip()
    if not dedupe_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="dedupeKey required")

    events_for_run = _RECORDED_EVENTS.setdefault(run_id, {})
    if dedupe_key in events_for_run:
        return {"status": "ok", "dedupe": dedupe_key}

    events_for_run[dedupe_key] = {
        "ts": body.ts,
        "kind": body.kind,
        "payload": body.payload,
        "recordedAt": time.time(),
    }
    return {"status": "ok", "dedupe": dedupe_key}


def _reset_state() -> None:
    _RECORDED_EVENTS.clear()


__all__ = ["_RECORDED_EVENTS", "_reset_state", "router"]
