from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends

from server.security import require_api_key
from server.services.caddie_insights import (
    CaddieInsights,
    load_and_compute_caddie_insights,
)

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.get("/api/caddie/insights", response_model=CaddieInsights)
async def get_caddie_insights(memberId: str, windowDays: int = 30) -> CaddieInsights:
    window = timedelta(days=windowDays)
    return load_and_compute_caddie_insights(memberId, window)
