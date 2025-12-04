from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.coach import DRILL_CATALOG, DrillCategory, build_practice_plan
from server.rounds.models import compute_round_summary
from server.rounds.service import RoundService, get_round_service
from server.rounds.weekly_summary import (
    _select_completed_rounds,
    build_weekly_summary_response,
)
from server.api.routers.summary import WeeklySummary, _derive_player_id

router = APIRouter(
    prefix="/api",
    tags=["coach"],
    dependencies=[Depends(require_api_key)],
)


class DrillOut(BaseModel):
    id: str
    name: str
    description: str
    category: DrillCategory
    focus_metric: str = Field(
        serialization_alias="focusMetric",
        validation_alias=AliasChoices("focusMetric", "focus_metric"),
    )
    difficulty: str
    duration_minutes: int = Field(
        serialization_alias="durationMinutes",
        validation_alias=AliasChoices("durationMinutes", "duration_minutes"),
    )
    recommended_balls: int | None = Field(
        default=None,
        serialization_alias="recommendedBalls",
        validation_alias=AliasChoices("recommendedBalls", "recommended_balls"),
    )

    model_config = ConfigDict(populate_by_name=True)


class PracticePlanOut(BaseModel):
    focus_categories: List[DrillCategory] = Field(
        serialization_alias="focusCategories",
        validation_alias=AliasChoices("focusCategories", "focus_categories"),
    )
    drills: List[DrillOut]

    model_config = ConfigDict(populate_by_name=True)


async def _load_weekly_summary(
    *, service: RoundService, player_id: str, now: datetime
) -> WeeklySummary:
    round_infos = service.list_rounds(player_id=player_id, limit=50)
    selected_infos = _select_completed_rounds(round_infos, now=now)

    summaries = [
        compute_round_summary(service.get_scores(player_id=player_id, round_id=info.id))
        for info in selected_infos
    ]

    remaining_rounds = [
        info for info in round_infos if info.id not in {r.id for r in selected_infos}
    ]
    comparison_infos = _select_completed_rounds(remaining_rounds, now=now)
    comparison_summaries = [
        compute_round_summary(service.get_scores(player_id=player_id, round_id=info.id))
        for info in comparison_infos
    ]

    payload = build_weekly_summary_response(
        summaries=summaries,
        comparison_summaries=comparison_summaries,
        round_infos=selected_infos,
        now=now,
    )
    return WeeklySummary.model_validate(payload)


@router.get("/coach/drills", response_model=list[DrillOut])
async def list_drills() -> list[DrillOut]:
    return [DrillOut.model_validate(drill) for drill in DRILL_CATALOG]


@router.get("/coach/practice/plan", response_model=PracticePlanOut)
async def get_practice_plan(
    max_minutes: int = 60,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> PracticePlanOut:
    player_id = _derive_player_id(api_key, user_id)
    now = datetime.now(timezone.utc)
    weekly_summary = await _load_weekly_summary(
        service=service, player_id=player_id, now=now
    )
    summary_payload = weekly_summary.model_dump()
    strokes_gained = (
        weekly_summary.strokes_gained.model_dump()
        if weekly_summary.strokes_gained
        else None
    )

    plan = build_practice_plan(
        weekly_summary=summary_payload,
        strokes_gained=strokes_gained,
        max_minutes=max_minutes,
        max_drills=4,
    )
    return PracticePlanOut.model_validate(plan)


__all__ = ["router"]
