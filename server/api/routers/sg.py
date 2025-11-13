from __future__ import annotations

from time import perf_counter

from fastapi import APIRouter, Depends

from server.security import require_api_key
from server.sg.compile import compile_shot_events
from server.services.sg_cache import (
    RunSG,
    compute_and_cache_run_sg,
    compute_shots_fingerprint,
    get_run_sg,
)
from server.services.telemetry import emit

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.get("/api/runs/{run_id}/sg", response_model=RunSG)
def get_run_sg_endpoint(run_id: str):
    shots = compile_shot_events(run_id)
    fingerprint = compute_shots_fingerprint(shots)

    cached = get_run_sg(run_id, fingerprint)
    if cached is not None:
        emit("sg.cache.hit", {"runId": run_id, "shots": len(shots)})
        return cached.model_dump(by_alias=True)

    start = perf_counter()
    result = compute_and_cache_run_sg(run_id, shots, fingerprint)
    elapsed_ms = int((perf_counter() - start) * 1000)
    emit(
        "sg.compute.ms",
        {"runId": run_id, "ms": elapsed_ms, "shots": len(result.shots)},
    )
    emit("sg.cache.miss", {"runId": run_id, "shots": len(result.shots)})
    return result.model_dump(by_alias=True)


__all__ = ["router", "get_run_sg_endpoint"]
