from __future__ import annotations

from typing import List, Optional

from pydantic import AliasChoices, BaseModel, Field


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
    avg_tempo_backswing_ms: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("avg_tempo_backswing_ms", "avgTempoBackswingMs"),
        serialization_alias="avgTempoBackswingMs",
    )
    avg_tempo_downswing_ms: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("avg_tempo_downswing_ms", "avgTempoDownswingMs"),
        serialization_alias="avgTempoDownswingMs",
    )
    avg_tempo_ratio: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("avg_tempo_ratio", "avgTempoRatio"),
        serialization_alias="avgTempoRatio",
    )
    tempo_sample_count: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("tempo_sample_count", "tempoSampleCount"),
        serialization_alias="tempoSampleCount",
    )


class UserHistory(BaseModel):
    user_id: str
    quickrounds: List[QuickRoundSnapshot] = Field(default_factory=list)
    range_sessions: List[RangeSessionSnapshot] = Field(default_factory=list)
