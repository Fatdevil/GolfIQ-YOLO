from __future__ import annotations

from typing import Any, List, Literal

from pydantic import BaseModel, ConfigDict, Field

CoachCategory = Literal["tee", "approach", "short", "putt", "sequence", "strategy"]


class PlayerStrength(BaseModel):
    category: CoachCategory
    title: str
    description: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class PlayerWeakness(BaseModel):
    category: CoachCategory
    severity: Literal["focus", "critical"]
    title: str
    description: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class DevelopmentStep(BaseModel):
    week: int
    title: str
    description: str
    focus_category: CoachCategory = Field(alias="focusCategory")
    suggested_missions: List[str] = Field(
        default_factory=list, alias="suggestedMissions"
    )

    model_config = ConfigDict(populate_by_name=True)


class PlayerModel(BaseModel):
    player_type: str = Field(alias="playerType")
    style: str | None = None
    strengths: List[PlayerStrength] = Field(default_factory=list)
    weaknesses: List[PlayerWeakness] = Field(default_factory=list)
    consistency_score: float | None = Field(default=None, alias="consistencyScore")
    development_index: float | None = Field(default=None, alias="developmentIndex")
    reference_run_id: str | None = Field(default=None, alias="referenceRunId")

    model_config = ConfigDict(populate_by_name=True)


class PlayerDevelopmentPlan(BaseModel):
    focus_categories: List[CoachCategory] = Field(
        default_factory=list, alias="focusCategories"
    )
    steps: List[DevelopmentStep] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class PlayerProfile(BaseModel):
    member_id: str = Field(alias="memberId")
    model: PlayerModel
    plan: PlayerDevelopmentPlan

    model_config = ConfigDict(populate_by_name=True)


__all__ = [
    "CoachCategory",
    "PlayerStrength",
    "PlayerWeakness",
    "DevelopmentStep",
    "PlayerModel",
    "PlayerDevelopmentPlan",
    "PlayerProfile",
]
