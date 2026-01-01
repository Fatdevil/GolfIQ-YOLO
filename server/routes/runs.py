from __future__ import annotations

from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..security import require_api_key
from ..storage.runs import (
    RunRecord,
    RunStatus,
    delete_run,
    get_run as load_run,
    list_runs,
    prune_runs,
)

router = APIRouter(
    prefix="/runs", tags=["runs"], dependencies=[Depends(require_api_key)]
)
router_v1 = APIRouter(
    prefix="/runs/v1", tags=["runs"], dependencies=[Depends(require_api_key)]
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


class RunKind(str):
    IMAGE = "image"
    VIDEO = "video"
    RANGE = "range"

    @classmethod
    def values(cls) -> list[str]:
        return [cls.IMAGE, cls.VIDEO, cls.RANGE]


class RunListItemV1(RunListItem):
    kind: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    input_ref: dict[str, Any] | None = None
    timings: dict[str, Any] | None = None
    started_at: str | None = None
    finished_at: str | None = None


class RunListResponseV1(BaseModel):
    items: list[RunListItemV1]
    next_cursor: str | None = None


class RunDetailResponse(RunListItemV1):
    created_ts: float
    updated_ts: float
    started_ts: float | None = None
    finished_ts: float | None = None
    params: dict[str, Any]
    metrics: dict[str, Any]
    events: list[int]
    model_variant_requested: str | None = None
    metadata: dict[str, Any]
    impact_preview: str | None = None
    inputs: dict[str, Any] | None = None


class RunPruneRequest(BaseModel):
    max_runs: int | None = Field(default=None, ge=0)
    max_age_days: int | None = Field(default=None, ge=0)


class RunPruneResponse(BaseModel):
    scanned: int
    deleted: int
    kept: int


def _item_v1(r: RunRecord) -> RunListItemV1:
    return RunListItemV1(
        run_id=r.run_id,
        status=r.status,
        source=r.source,
        source_type=r.source_type,
        created_at=r.created_at,
        updated_at=r.updated_at,
        started_at=r.started_at,
        finished_at=r.finished_at,
        model_variant_selected=r.model_variant_selected,
        override_source=r.override_source,
        inference_timing=r.inference_timing,
        error_code=r.error_code,
        error_message=r.error_message,
        kind=r.kind,
        input_ref=r.input_ref,
        timings=r.timing_summary or None,
    )


def _detail_item(r: RunRecord) -> RunDetailResponse:
    return RunDetailResponse(
        **_item_v1(r).model_dump(),
        created_ts=r.created_ts,
        updated_ts=r.updated_ts,
        started_ts=r.started_ts,
        finished_ts=r.finished_ts,
        params=r.params or {},
        metrics=r.metrics or {},
        events=r.events or [],
        model_variant_requested=r.model_variant_requested,
        metadata=r.metadata or {},
        impact_preview=r.impact_preview,
        inputs=r.input_ref,
    )


def _encode_cursor(r: RunRecord) -> str:
    return f"{r.created_ts}:{r.run_id}"


def _decode_cursor(cursor: str) -> tuple[float, str]:
    try:
        created_ts, run_id = cursor.split(":", 1)
        return float(created_ts), run_id
    except Exception as exc:
        raise HTTPException(400, f"invalid cursor: {cursor}") from exc


def _error_payload(run_id: str, error_code: str, message: str) -> dict[str, str]:
    return {"run_id": run_id, "error_code": error_code, "message": message}


@router.get("", response_model=List[RunListItem])
def get_runs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10_000),
):
    return [_item(r) for r in list_runs(limit=limit, offset=offset)]


@router_v1.get("", response_model=RunListResponseV1)
def get_runs_v1(
    limit: int = Query(50, ge=1, le=200),
    status: RunStatus | None = Query(
        default=None,
        description='Optional status filter: one of ["processing","succeeded","failed"]',
    ),
    kind: str | None = Query(
        default=None,
        description='Optional run kind filter: one of ["image","video","range"]',
    ),
    model_variant: str | None = Query(
        default=None, description="Filter runs by selected model variant"
    ),
    cursor: str | None = Query(
        default=None,
        description="Opaque cursor for pagination (created_ts:run_id)",
    ),
) -> RunListResponseV1:
    kind_value = kind.lower() if kind else None
    if kind_value is not None and kind_value not in RunKind.values():
        raise HTTPException(400, f"invalid kind '{kind}'")
    decoded_cursor = _decode_cursor(cursor) if cursor else None
    filter_status = status.value if isinstance(status, RunStatus) else status
    allowed_statuses = {
        RunStatus.PROCESSING.value,
        RunStatus.SUCCEEDED.value,
        RunStatus.FAILED.value,
    }
    if filter_status:
        status_value = str(filter_status).lower()
        if status_value not in allowed_statuses:
            raise HTTPException(400, f"invalid status '{filter_status}'")
        filter_status = status_value
    kind_filter = kind_value
    records = list_runs(
        limit=limit + 1,  # fetch one extra to detect a next page
        offset=0,
        status=filter_status,
        kind=kind_filter,
        model_variant=model_variant,
        cursor=decoded_cursor,
    )
    has_more = len(records) > limit
    page = records[:limit]
    next_cursor = _encode_cursor(page[-1]) if has_more and page else None
    return RunListResponseV1(
        items=[_item_v1(r) for r in page],
        next_cursor=next_cursor,
    )


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
        "timings": getattr(r, "timing_summary", None) or None,
        "kind": getattr(r, "kind", None),
        "inputs": r.input_ref,
    }


@router_v1.get("/{run_id}", response_model=RunDetailResponse)
def get_run_detail(run_id: str) -> RunDetailResponse:
    r = load_run(run_id)
    if r is None:
        raise HTTPException(
            status_code=404,
            detail=_error_payload(run_id, "RUN_NOT_FOUND", "Run not found"),
        )
    return _detail_item(r)


@router_v1.post("/prune", response_model=RunPruneResponse)
def prune_runs_v1(payload: RunPruneRequest | None = None) -> RunPruneResponse:
    max_runs = payload.max_runs if payload else None
    max_age_days = payload.max_age_days if payload else None
    result = prune_runs(max_runs=max_runs, max_age_days=max_age_days)
    return RunPruneResponse(**result)


@router.delete("/{run_id}")
def delete(run_id: str):
    if not delete_run(run_id):
        raise HTTPException(404, "run not found")
    return {"deleted": run_id}
