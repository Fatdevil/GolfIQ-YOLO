"""Range practice API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from server.security import require_api_key

from server.cv.range_analyze import RangeAnalyzeIn, RangeAnalyzeOut, run_range_analyze

router = APIRouter(
    prefix="/range/practice",
    tags=["range-practice"],
    dependencies=[Depends(require_api_key)],
)


@router.post("/analyze", response_model=RangeAnalyzeOut)
def analyze_range_capture(payload: RangeAnalyzeIn) -> RangeAnalyzeOut:
    """Analyze a range capture using the configured CV backend."""

    return run_range_analyze(payload)


__all__ = ["router"]
