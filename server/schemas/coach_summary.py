from __future__ import annotations

from typing import Literal, List, Optional

from pydantic import BaseModel, Field

from server.schemas.coach_diagnosis import CoachDiagnosis
from server.schemas.player_profile import PlayerModel


class CoachSgCategory(BaseModel):
    name: Literal["tee", "approach", "short", "putt"]
    sg: float


class CoachHoleSg(BaseModel):
    hole: int
    gross_score: int
    sg_total: float
    worst_category: Optional[str] = None


class CoachSequenceSummary(BaseModel):
    max_shoulder_rotation: float
    max_hip_rotation: float
    max_x_factor: float
    sequence_order: List[str] = Field(default_factory=list)
    is_ideal: bool


class CoachCaddieHighlight(BaseModel):
    trusted_club: Optional[str] = None
    trusted_club_trust_score: Optional[float] = None
    ignored_club: Optional[str] = None
    ignored_club_trust_score: Optional[float] = None


class CoachMissionSummary(BaseModel):
    mission_id: Optional[str] = None
    mission_label: Optional[str] = None
    success: Optional[bool] = None


class CoachRoundSummary(BaseModel):
    run_id: str
    member_id: Optional[str] = None
    course_name: Optional[str] = None
    tees: Optional[str] = None
    date: Optional[str] = None
    score: Optional[int] = None

    sg_total: Optional[float] = None
    sg_by_category: List[CoachSgCategory] = Field(default_factory=list)
    sg_per_hole: List[CoachHoleSg] = Field(default_factory=list)

    sequence: Optional[CoachSequenceSummary] = None
    caddie: Optional[CoachCaddieHighlight] = None
    mission: Optional[CoachMissionSummary] = None
    diagnosis: Optional[CoachDiagnosis] = None
    player_model: Optional[PlayerModel] = None
