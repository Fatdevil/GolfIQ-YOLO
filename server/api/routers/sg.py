from __future__ import annotations

from time import perf_counter
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from server.security import require_api_key
from server.sg.anchors import Anchor as SGAnchor
from server.sg.anchors import AnchorIn as SGAnchorIn
from server.sg.anchors import list_anchors as sg_list_anchors
from server.sg.anchors import upsert_anchors as sg_upsert_anchors
from server.sg.compile import compile_shot_events
from server.sg.schemas import RunSG
from server.services.sg_cache import (
    compute_and_cache_run_sg,
    compute_shots_fingerprint,
    get_run_sg,
)
from server.services.telemetry import emit

router = APIRouter(dependencies=[Depends(require_api_key)])


class ShotSGResponse(BaseModel):
    hole: int
    shot: int
    sg_delta: float

    model_config = ConfigDict(populate_by_name=True)


class HoleSGResponse(BaseModel):
    hole: int
    sg_total: float
    shots: List[ShotSGResponse]

    model_config = ConfigDict(populate_by_name=True)


class RunSGResponse(BaseModel):
    run_id: str
    sg_total: float
    holes: List[HoleSGResponse]
    shots: List[ShotSGResponse] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


def _compute_run(run_id: str) -> RunSG:
    shots = compile_shot_events(run_id)
    fingerprint = compute_shots_fingerprint(shots)

    cached = get_run_sg(run_id, fingerprint)
    if cached is not None:
        emit("sg.cache.hit", {"runId": run_id, "shots": len(shots)})
        return cached

    start = perf_counter()
    result = compute_and_cache_run_sg(run_id, shots, fingerprint)
    elapsed_ms = int((perf_counter() - start) * 1000)
    emit(
        "sg.compute.ms",
        {"runId": run_id, "ms": elapsed_ms, "shots": len(result.shots)},
    )
    emit("sg.cache.miss", {"runId": run_id, "shots": len(result.shots)})
    return result


def _serialize_snake_case(run: RunSG) -> RunSGResponse:
    holes = [
        HoleSGResponse(
            hole=hole_entry.hole,
            sg_total=hole_entry.sg_total,
            shots=[
                ShotSGResponse(hole=shot.hole, shot=shot.shot, sg_delta=shot.sg_delta)
                for shot in hole_entry.sg_shots
            ],
        )
        for hole_entry in run.holes
    ]
    shots = [
        ShotSGResponse(hole=shot.hole, shot=shot.shot, sg_delta=shot.sg_delta)
        for shot in run.shots
    ]
    return RunSGResponse(
        run_id=run.run_id, sg_total=run.sg_total, holes=holes, shots=shots
    )


@router.get("/api/runs/{run_id}/sg", response_model=RunSG)
def get_run_sg_endpoint(run_id: str):
    result = _compute_run(run_id)
    return result.model_dump(by_alias=True)


@router.get("/api/sg/runs/{run_id}", response_model=RunSGResponse)
def get_run_sg_v2(run_id: str):
    result = _compute_run(run_id)
    return _serialize_snake_case(result)


@router.post("/api/sg/runs/{run_id}/anchors", response_model=list[SGAnchor])
def post_run_anchors(run_id: str, payload: list[SGAnchorIn]):
    return sg_upsert_anchors(run_id, payload)


@router.get("/api/sg/runs/{run_id}/anchors", response_model=list[SGAnchor])
def get_run_anchors(run_id: str):
    return sg_list_anchors(run_id)


__all__ = [
    "router",
    "get_run_sg_endpoint",
    "get_run_sg_v2",
    "post_run_anchors",
    "get_run_anchors",
]
