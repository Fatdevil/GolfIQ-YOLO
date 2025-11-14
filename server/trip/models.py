from __future__ import annotations

import uuid
from typing import List, Optional

from pydantic import BaseModel, Field


class TripPlayer(BaseModel):
    id: str
    name: str


class TripHoleScore(BaseModel):
    hole: int
    player_id: str
    strokes: Optional[int] = None
    putts: Optional[int] = None


class TripRound(BaseModel):
    id: str
    created_ts: float
    course_id: Optional[str] = None
    course_name: str
    tees_name: Optional[str] = None
    holes: int
    players: List[TripPlayer]
    scores: List[TripHoleScore] = Field(default_factory=list)
    public_token: Optional[str] = None


def new_trip_round_id() -> str:
    """Generate a new trip round identifier."""

    return f"trip_{uuid.uuid4().hex[:12]}"
