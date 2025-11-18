"""Helpers for constructing caddie telemetry events."""

from __future__ import annotations

from typing import Optional

from server.schemas.caddie_telemetry import (
    CADDIE_ADVICE_ACCEPTED_V1,
    CADDIE_ADVICE_SHOWN_V1,
    SHOT_OUTCOME_V1,
    CaddieTelemetryEvent,
)


def build_caddie_advice_shown_event(
    *,
    member_id: str,
    run_id: str,
    hole: int,
    recommended_club: str,
    shot_index: Optional[int] = None,
    course_id: Optional[str] = None,
    target_distance_m: Optional[float] = None,
    advice_id: Optional[str] = None,
) -> CaddieTelemetryEvent:
    return CaddieTelemetryEvent(
        type=CADDIE_ADVICE_SHOWN_V1,
        memberId=member_id,
        runId=run_id,
        hole=hole,
        shotIndex=shot_index,
        courseId=course_id,
        recommendedClub=recommended_club,
        targetDistance_m=target_distance_m,
        adviceId=advice_id,
    )


def build_caddie_advice_accepted_event(
    *,
    member_id: str,
    run_id: str,
    hole: int,
    recommended_club: str,
    selected_club: Optional[str] = None,
    shot_index: Optional[int] = None,
    course_id: Optional[str] = None,
    advice_id: Optional[str] = None,
) -> CaddieTelemetryEvent:
    return CaddieTelemetryEvent(
        type=CADDIE_ADVICE_ACCEPTED_V1,
        memberId=member_id,
        runId=run_id,
        hole=hole,
        shotIndex=shot_index,
        courseId=course_id,
        recommendedClub=recommended_club,
        selectedClub=selected_club or recommended_club,
        adviceId=advice_id,
    )


def build_shot_outcome_event(
    *,
    member_id: str,
    run_id: str,
    hole: int,
    club: str,
    shot_index: Optional[int] = None,
    course_id: Optional[str] = None,
    carry_m: Optional[float] = None,
    end_distance_to_pin_m: Optional[float] = None,
    result_category: Optional[str] = None,
) -> CaddieTelemetryEvent:
    return CaddieTelemetryEvent(
        type=SHOT_OUTCOME_V1,
        memberId=member_id,
        runId=run_id,
        hole=hole,
        shotIndex=shot_index,
        courseId=course_id,
        club=club,
        carry_m=carry_m,
        endDistanceToPin_m=end_distance_to_pin_m,
        resultCategory=result_category,
    )
