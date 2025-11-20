from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server.bundles.storage import get_bundle
from server.security import require_api_key
from server.services.hole_detect import SuggestedHole, suggest_hole_for_location

router = APIRouter(dependencies=[Depends(require_api_key)])


class HoleDetectQuery(BaseModel):
    courseId: str
    lat: float
    lon: float
    lastHole: int | None = None


class HoleDetectResponse(BaseModel):
    hole: int
    distance_m: float
    confidence: float
    reason: str


@router.post("/api/hole/detect", response_model=HoleDetectResponse)
async def detect_hole(body: HoleDetectQuery) -> HoleDetectResponse:
    bundle = get_bundle(body.courseId)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Unknown courseId")

    suggestion: SuggestedHole | None = suggest_hole_for_location(
        bundle=bundle,
        lat=body.lat,
        lon=body.lon,
        last_hole=body.lastHole,
    )
    if suggestion is None:
        raise HTTPException(status_code=404, detail="No suitable hole found")

    return HoleDetectResponse(
        hole=suggestion.hole,
        distance_m=suggestion.distance_m,
        confidence=suggestion.confidence,
        reason=suggestion.reason,
    )
