from __future__ import annotations

from datetime import datetime
from typing import Dict, Optional
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class ClubDistanceStats(BaseModel):
    club: str
    samples: int
    baseline_carry_m: float = Field(alias="baselineCarryM")
    carry_std_m: float | None = Field(default=None, alias="carryStdM")
    last_updated: datetime = Field(alias="lastUpdated")

    manual_carry_m: float | None = Field(default=None, alias="manualCarryM")
    source: Literal["auto", "manual"] = "auto"

    model_config = ConfigDict(populate_by_name=True)


class PlayerClubDistanceProfile(BaseModel):
    player_id: str = Field(alias="playerId")
    clubs: Dict[str, ClubDistanceStats]

    model_config = ConfigDict(populate_by_name=True)


class OnCourseShot(BaseModel):
    player_id: str = Field(validation_alias=AliasChoices("player_id", "playerId"))
    club: str
    start_lat: float = Field(validation_alias=AliasChoices("start_lat", "startLat"))
    start_lon: float = Field(validation_alias=AliasChoices("start_lon", "startLon"))
    end_lat: float = Field(validation_alias=AliasChoices("end_lat", "endLat"))
    end_lon: float = Field(validation_alias=AliasChoices("end_lon", "endLon"))
    wind_speed_mps: float = Field(
        default=0.0,
        validation_alias=AliasChoices(
            "wind_speed_mps", "windSpeed_mps", "windSpeedMps"
        ),
    )
    wind_direction_deg: float | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "wind_direction_deg",
            "windDir_deg",
            "windDirDeg",
            "windDirection_deg",
            "windDirectionDeg",
        ),
    )
    elevation_delta_m: float = Field(
        default=0.0,
        validation_alias=AliasChoices(
            "elevation_delta_m", "elevationDelta_m", "elevationDeltaM"
        ),
    )
    recorded_at: Optional[datetime] = Field(
        default=None,
        validation_alias=AliasChoices(
            "recorded_at", "recordedAt", "timestamp", "timestampMs"
        ),
    )

    model_config = ConfigDict(populate_by_name=True)


__all__ = ["ClubDistanceStats", "PlayerClubDistanceProfile", "OnCourseShot"]
