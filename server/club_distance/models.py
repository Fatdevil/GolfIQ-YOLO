from __future__ import annotations

from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict, Field


class ClubDistanceStats(BaseModel):
    club: str
    samples: int
    baseline_carry_m: float = Field(alias="baselineCarryM")
    carry_std_m: float | None = Field(default=None, alias="carryStdM")
    last_updated: datetime = Field(alias="lastUpdated")

    model_config = ConfigDict(populate_by_name=True)


class PlayerClubDistanceProfile(BaseModel):
    player_id: str = Field(alias="playerId")
    clubs: Dict[str, ClubDistanceStats]

    model_config = ConfigDict(populate_by_name=True)


class OnCourseShot(BaseModel):
    player_id: str
    club: str
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    wind_speed_mps: float = 0.0
    wind_direction_deg: float | None = None
    elevation_delta_m: float = 0.0
    recorded_at: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


__all__ = ["ClubDistanceStats", "PlayerClubDistanceProfile", "OnCourseShot"]
