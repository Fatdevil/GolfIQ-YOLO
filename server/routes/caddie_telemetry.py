from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from server.routes import ws_telemetry
from server.schemas.caddie_telemetry import (
    CADDIE_ADVICE_ACCEPTED_V1,
    CADDIE_ADVICE_SHOWN_V1,
    SHOT_OUTCOME_V1,
    CaddieTelemetryEvent,
)
from server.security import require_api_key
from server.services.caddie_telemetry import (
    build_caddie_advice_accepted_event,
    build_caddie_advice_shown_event,
    build_shot_outcome_event,
)

router = APIRouter(dependencies=[Depends(require_api_key)])


class CaddieTelemetryIn(BaseModel):
    type: str = Field(..., description="Telemetry event type")
    memberId: str
    runId: str
    hole: int
    shotIndex: int | None = None
    courseId: str | None = None
    recommendedClub: str | None = None
    selectedClub: str | None = None
    club: str | None = None
    targetDistance_m: float | None = None
    carry_m: float | None = None
    endDistanceToPin_m: float | None = None
    resultCategory: str | None = None
    adviceId: str | None = None


def _to_event(payload: CaddieTelemetryIn) -> CaddieTelemetryEvent:
    if payload.type == CADDIE_ADVICE_SHOWN_V1:
        if not payload.recommendedClub:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="recommendedClub required for advice shown",
            )
        return build_caddie_advice_shown_event(
            member_id=payload.memberId,
            run_id=payload.runId,
            hole=payload.hole,
            shot_index=payload.shotIndex,
            course_id=payload.courseId,
            recommended_club=payload.recommendedClub,
            target_distance_m=payload.targetDistance_m,
            advice_id=payload.adviceId,
        )
    if payload.type == CADDIE_ADVICE_ACCEPTED_V1:
        if not payload.recommendedClub:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="recommendedClub required for advice accepted",
            )
        return build_caddie_advice_accepted_event(
            member_id=payload.memberId,
            run_id=payload.runId,
            hole=payload.hole,
            shot_index=payload.shotIndex,
            course_id=payload.courseId,
            recommended_club=payload.recommendedClub,
            selected_club=payload.selectedClub,
            advice_id=payload.adviceId,
        )
    if payload.type == SHOT_OUTCOME_V1:
        if not payload.club:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="club required for shot outcome",
            )
        return build_shot_outcome_event(
            member_id=payload.memberId,
            run_id=payload.runId,
            hole=payload.hole,
            shot_index=payload.shotIndex,
            course_id=payload.courseId,
            club=payload.club,
            carry_m=payload.carry_m,
            end_distance_to_pin_m=payload.endDistanceToPin_m,
            result_category=payload.resultCategory,
        )
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown caddie telemetry type")


@router.post("/api/caddie/telemetry")
async def ingest_caddie_telemetry(payload: CaddieTelemetryIn):
    event = _to_event(payload)
    return await ws_telemetry.dispatch_telemetry(event)
