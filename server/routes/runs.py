from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..storage.runs import RunRecord, delete_run, list_runs, load_run

router = APIRouter(prefix="/runs", tags=["runs"])


class RunListItem(BaseModel):
    run_id: str
    created_ts: float
    source: str
    mode: str
    confidence: float | None = None
    ball_speed_mps: float | None = None


def _item(r: RunRecord) -> RunListItem:
    m = r.metrics or {}
    return RunListItem(
        run_id=r.run_id,
        created_ts=r.created_ts,
        source=r.source,
        mode=r.mode,
        confidence=m.get("confidence"),
        ball_speed_mps=m.get("ball_speed_mps"),
    )


@router.get("", response_model=List[RunListItem])
def get_runs(limit: int = Query(50, ge=1, le=200)):
    return [_item(r) for r in list_runs(limit)]


@router.get("/{run_id}")
def get_run(run_id: str):
    r = load_run(run_id)
    if not r:
        raise HTTPException(404, "run not found")
    return {
        "run_id": r.run_id,
        "created_ts": r.created_ts,
        "source": r.source,
        "mode": r.mode,
        "params": r.params,
        "metrics": r.metrics,
        "events": r.events,
    }


@router.delete("/{run_id}")
def delete(run_id: str):
    if not delete_run(run_id):
        raise HTTPException(404, "run not found")
    return {"deleted": run_id}
