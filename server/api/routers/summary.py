from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.rounds.models import compute_round_summary
from server.rounds.service import RoundService, get_round_service
from server.rounds.weekly_summary import (
    _select_completed_rounds,
    build_weekly_summary_response,
)

router = APIRouter(
    prefix="/api/player/summary", tags=["summary"], dependencies=[Depends(require_api_key)]
)


class WeeklySummaryCategory(BaseModel):
    grade: str | None = None
    trend: Literal["up", "down", "flat"] | None = None
    note: str | None = None


class WeeklySummaryPeriod(BaseModel):
    from_date: str = Field(
        serialization_alias="from", validation_alias=AliasChoices("from", "from_date")
    )
    to_date: str = Field(
        serialization_alias="to", validation_alias=AliasChoices("to", "to_date")
    )
    round_count: int = Field(
        serialization_alias="roundCount",
        validation_alias=AliasChoices("roundCount", "round_count"),
    )

    model_config = ConfigDict(populate_by_name=True)


class WeeklySummaryHeadline(BaseModel):
    text: str
    emoji: str | None = None


class WeeklySummaryCoreStats(BaseModel):
    avg_score: float | None = Field(
        default=None,
        serialization_alias="avgScore",
        validation_alias=AliasChoices("avgScore", "avg_score"),
    )
    best_score: int | None = Field(
        default=None,
        serialization_alias="bestScore",
        validation_alias=AliasChoices("bestScore", "best_score"),
    )
    worst_score: int | None = Field(
        default=None,
        serialization_alias="worstScore",
        validation_alias=AliasChoices("worstScore", "worst_score"),
    )
    avg_to_par: str | None = Field(
        default=None,
        serialization_alias="avgToPar",
        validation_alias=AliasChoices("avgToPar", "avg_to_par"),
    )
    holes_played: int | None = Field(
        default=None,
        serialization_alias="holesPlayed",
        validation_alias=AliasChoices("holesPlayed", "holes_played"),
    )

    model_config = ConfigDict(populate_by_name=True)


class WeeklySummary(BaseModel):
    period: WeeklySummaryPeriod
    headline: WeeklySummaryHeadline
    core_stats: WeeklySummaryCoreStats = Field(
        serialization_alias="coreStats",
        validation_alias=AliasChoices("coreStats", "core_stats"),
    )
    categories: dict[str, WeeklySummaryCategory]
    focus_hints: list[str] = Field(
        default_factory=list,
        serialization_alias="focusHints",
        validation_alias=AliasChoices("focusHints", "focus_hints"),
    )

    model_config = ConfigDict(populate_by_name=True)


def _derive_player_id(api_key: str | None, user_id: str | None) -> str:
    return user_id or api_key or "anonymous"


@router.get("/weekly", response_model=WeeklySummary)
async def get_weekly_summary(
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> WeeklySummary:
    player_id = _derive_player_id(api_key, user_id)
    now = datetime.now(timezone.utc)

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


__all__ = ["router"]
