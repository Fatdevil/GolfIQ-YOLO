"""Domain models for CaddieCore."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class LieType(str, Enum):
    TEE = "tee"
    FAIRWAY = "fairway"
    ROUGH = "rough"


class Scenario(str, Enum):
    RANGE = "range"
    ON_COURSE = "on_course"


class Confidence(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class PlayerProfile(BaseModel):
    player_id: str = Field(..., max_length=128)
    handicap_index: Optional[float] = Field(default=None)
    clubs: list[str] = Field(..., min_length=1)
    dominant_hand: Optional[str] = Field(default=None)

    @field_validator("clubs")
    @classmethod
    def _ensure_unique_clubs(cls, clubs: list[str]) -> list[str]:
        deduped = list(dict.fromkeys(clubs))
        if len(deduped) != len(clubs):
            raise ValueError("clubs must be unique")
        return clubs


class ShotSample(BaseModel):
    club: str
    carry_m: float
    lateral_m: float
    timestamp: datetime


class ShotAggregate(BaseModel):
    club: str
    count: int
    carry_mean: float
    carry_std: float
    lateral_std: float
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    confidence: Confidence


class TargetContext(BaseModel):
    target_distance_m: float = Field(..., gt=0)
    elevation_delta_m: float
    wind_speed_mps: float = Field(..., ge=0)
    wind_direction_deg: float = Field(..., ge=0, lt=360)
    lie_type: LieType
    hazard_distance_m: Optional[float] = Field(default=None, gt=0)


class Recommendation(BaseModel):
    club: str
    carry_p50_m: float
    carry_p80_m: float
    safety_margin_m: float
    conservative_club: Optional[str] = None
    confidence: Confidence
    hazard_flag: bool = False


class ExplainFactor(BaseModel):
    name: str
    weight: float = Field(..., ge=0, le=1)
    direction: str = Field(..., pattern="^(positive|negative)$")


class RecommendationPayload(BaseModel):
    player: PlayerProfile
    shot_samples: list[ShotSample] = Field(..., min_length=50)
    target: TargetContext
    scenario: Scenario


class RecommendationResponse(BaseModel):
    recommendation: Recommendation
    explain_score: list[ExplainFactor] = Field(..., min_length=1, max_length=3)
    telemetry_id: str
    generated_at: datetime


class ErrorEnvelope(BaseModel):
    error_code: str
    message: str
    details: Optional[dict] = None
