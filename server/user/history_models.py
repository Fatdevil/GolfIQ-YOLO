from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class QuickRoundSnapshot(BaseModel):
    id: str
    started_at: str
    completed_at: Optional[str] = None
    course_name: Optional[str] = None
    total_strokes: Optional[int] = None
    to_par: Optional[int] = None
    net_to_par: Optional[float] = None


class RangeSessionSnapshot(BaseModel):
    id: str
    started_at: str
    ended_at: str
    club_id: Optional[str] = None
    mission_id: Optional[str] = None
    shot_count: int
    avg_carry_m: Optional[float] = None
    carry_std_m: Optional[float] = None


class UserHistory(BaseModel):
    user_id: str
    quickrounds: List[QuickRoundSnapshot] = Field(default_factory=list)
    range_sessions: List[RangeSessionSnapshot] = Field(default_factory=list)
