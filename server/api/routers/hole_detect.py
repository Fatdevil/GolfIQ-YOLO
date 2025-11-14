from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from server.api.security import require_api_key
from server.courses.hole_detect import suggest_hole
from server.courses.store import get_course_bundle

router = APIRouter(
    prefix="/api/auto-hole",
    tags=["auto-hole"],
    dependencies=[Depends(require_api_key)],
)


class HoleDetectIn(BaseModel):
    course_id: str = Field(..., alias="courseId")
    lat: float
    lon: float
    current_hole: int | None = Field(default=None, alias="currentHole")
    model_config = ConfigDict(populate_by_name=True)


class HoleDetectOut(BaseModel):
    course_id: str = Field(..., alias="courseId")
    suggested_hole: int | None = Field(default=None, alias="suggestedHole")
    confidence: float | None = None
    reason: str | None = None
    model_config = ConfigDict(populate_by_name=True)


@router.post("", response_model=HoleDetectOut)
def post_auto_hole(payload: HoleDetectIn) -> HoleDetectOut:
    bundle = get_course_bundle(payload.course_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="course_not_found")

    suggestion = suggest_hole(
        bundle,
        payload.lat,
        payload.lon,
        current_hole=payload.current_hole,
    )
    if not suggestion:
        return HoleDetectOut(
            course_id=payload.course_id,
            suggested_hole=None,
            confidence=None,
            reason=None,
        )

    return HoleDetectOut(
        course_id=payload.course_id,
        suggested_hole=suggestion.hole,
        confidence=suggestion.confidence,
        reason=suggestion.reason,
    )
