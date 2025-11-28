from __future__ import annotations

from datetime import datetime
from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field


class SgTrendPoint(BaseModel):
    run_id: str = Field(alias="runId")
    date: datetime
    sg_total: float = Field(alias="sgTotal")
    sg_tee: float = Field(alias="sgTee")
    sg_approach: float = Field(alias="sgApproach")
    sg_short: float = Field(alias="sgShort")
    sg_putt: float = Field(alias="sgPutt")

    model_config = ConfigDict(populate_by_name=True)


class MissionStats(BaseModel):
    total_missions: int = Field(alias="totalMissions")
    completed: int
    completion_rate: float = Field(alias="completionRate")

    model_config = ConfigDict(populate_by_name=True)


class CategoryStatus(BaseModel):
    category: Literal["tee", "approach", "short", "putt", "sequence"]
    recent_trend: Literal["improving", "stable", "worsening"] = Field(
        alias="recentTrend"
    )
    last_severity: Literal["ok", "focus", "critical"] = Field(alias="lastSeverity")

    model_config = ConfigDict(populate_by_name=True)


class PlayerAnalytics(BaseModel):
    member_id: str = Field(alias="memberId")
    sg_trend: List[SgTrendPoint] = Field(alias="sgTrend")
    category_status: List[CategoryStatus] = Field(alias="categoryStatus")
    mission_stats: MissionStats = Field(alias="missionStats")
    best_round_id: str | None = Field(default=None, alias="bestRoundId")
    worst_round_id: str | None = Field(default=None, alias="worstRoundId")

    model_config = ConfigDict(populate_by_name=True)


__all__ = [
    "SgTrendPoint",
    "MissionStats",
    "CategoryStatus",
    "PlayerAnalytics",
]
