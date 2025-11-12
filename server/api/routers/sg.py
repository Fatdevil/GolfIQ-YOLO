from __future__ import annotations

from fastapi import APIRouter, Depends

from server.sg.compile import compile_shot_events
from server.sg.engine import compute_run_sg
from server.services.sg_cache import CACHE
from server.services.telemetry import emit
from server.security import require_api_key

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.get("/api/runs/{run_id}/sg")
def get_run_sg(run_id: str):
    shots, fp = compile_shot_events(run_id)
    cached = CACHE.get(run_id, fp)
    if cached is not None:
        emit("sg.cache.hit", {"runId": run_id})
        return cached

    emit("sg.cache.miss", {"runId": run_id, "shots": len(shots)})

    from time import perf_counter

    start = perf_counter()
    result = compute_run_sg(shots)
    elapsed_ms = int((perf_counter() - start) * 1000)
    emit(
        "sg.calc.ms",
        {"runId": run_id, "ms": elapsed_ms, "shots": len(shots)},
    )

    payload = result.model_dump()
    CACHE.set(run_id, fp, payload)
    return payload


__all__ = ["router", "get_run_sg"]
