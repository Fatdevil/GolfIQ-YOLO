from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict, Field


class ClubDistanceEntry(BaseModel):
    club_id: str = Field(alias="clubId")
    label: str
    active: bool = True
    avg_carry_m: float | None = Field(default=None, alias="avgCarryM")
    std_dev_m: float | None = Field(default=None, alias="stdDevM")
    sample_count: int = Field(default=0, alias="sampleCount")
    last_updated: datetime | None = Field(default=None, alias="lastUpdated")
    manual_avg_carry_m: float | None = Field(default=None, alias="manualAvgCarryM")

    sum_carry_m: float = 0.0
    sum_sq_carry_m: float = 0.0

    model_config = ConfigDict(populate_by_name=True)


class PlayerBag(BaseModel):
    player_id: str = Field(alias="playerId")
    clubs: List[ClubDistanceEntry]

    model_config = ConfigDict(populate_by_name=True)


class ClubDistancePublic(BaseModel):
    club_id: str = Field(alias="clubId")
    label: str
    active: bool = True
    avg_carry_m: float | None = Field(default=None, alias="avgCarryM")
    std_dev_m: float | None = Field(default=None, alias="stdDevM")
    sample_count: int = Field(default=0, alias="sampleCount")
    last_updated: datetime | None = Field(default=None, alias="lastUpdated")
    manual_avg_carry_m: float | None = Field(default=None, alias="manualAvgCarryM")

    model_config = ConfigDict(populate_by_name=True)


class PlayerBagPublic(BaseModel):
    player_id: str = Field(alias="playerId")
    clubs: List[ClubDistancePublic]

    model_config = ConfigDict(populate_by_name=True)


__all__ = [
    "ClubDistanceEntry",
    "ClubDistancePublic",
    "PlayerBag",
    "PlayerBagPublic",
]
