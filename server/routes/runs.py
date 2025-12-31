from __future__ import annotations

from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..security import require_api_key
from ..storage.runs import (
    RunRecord,
    RunStatus,
    delete_run,
    get_run as load_run,
    list_runs,
)

router = APIRouter(
    prefix="/runs", tags=["runs"], dependencies=[Depends(require_api_key)]
)


class RunListItem(BaseModel):
    run_id: str
    status: RunStatus
    source: str
    source_type: str
    created_at: str
    updated_at: str
    model_variant_selected: str | None = None
    override_source: str
    inference_timing: dict[str, Any] | None = None


def _item(r: RunRecord) -> RunListItem:
    return RunListItem(
        run_id=r.run_id,
        status=r.status,
        source=r.source,
        source_type=r.source_type,
        created_at=r.created_at,
        updated_at=r.updated_at,
        model_variant_selected=r.model_variant_selected,
        override_source=r.override_source,
        inference_timing=r.inference_timing,
    )


@router.get("", response_model=List[RunListItem])
def get_runs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10_000),
):
    return [_item(r) for r in list_runs(limit=limit, offset=offset)]


@router.get("/{run_id}")
def get_run(run_id: str):
    r = load_run(run_id)
    if r is None:
        raise HTTPException(404, "run not found")
    return {
        "run_id": r.run_id,
        "created_ts": r.created_ts,
        "updated_ts": r.updated_ts,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
        "source": r.source,
        "source_type": r.source_type,
        "mode": r.mode,
        "params": r.params,
        "metrics": r.metrics,
        "events": r.events,
        "impact_preview": r.impact_preview,
        "status": r.status,
        "model_variant_requested": r.model_variant_requested,
        "model_variant_selected": r.model_variant_selected,
        "override_source": r.override_source,
        "inference_timing": r.inference_timing,
        "error_code": r.error_code,
        "error_message": r.error_message,
        "input_ref": r.input_ref,
        "metadata": r.metadata,
    }


@router.delete("/{run_id}")
def delete(run_id: str):
    if not delete_run(run_id):
        raise HTTPException(404, "run not found")
    return {"deleted": run_id}
