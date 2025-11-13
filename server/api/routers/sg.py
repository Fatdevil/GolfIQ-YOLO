from __future__ import annotations

from time import perf_counter

from fastapi import APIRouter, Depends

from server.security import require_api_key
from server.services.sg_cache import RunSG, compute_and_cache_run_sg, get_run_sg
from server.services.telemetry import emit

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.get("/api/runs/{run_id}/sg", response_model=RunSG)
def get_run_sg_endpoint(run_id: str):
    cached = get_run_sg(run_id)
    if cached is not None:
        emit("sg.cache.hit", {"runId": run_id, "shots": len(cached.shots)})
        return cached.model_dump(by_alias=True)

    start = perf_counter()
    result = compute_and_cache_run_sg(run_id)
    elapsed_ms = int((perf_counter() - start) * 1000)
    emit(
        "sg.compute.ms",
        {"runId": run_id, "ms": elapsed_ms, "shots": len(result.shots)},
    )
    emit("sg.cache.miss", {"runId": run_id, "shots": len(result.shots)})
    return result.model_dump(by_alias=True)


__all__ = ["router", "get_run_sg_endpoint"]
