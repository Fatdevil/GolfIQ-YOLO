from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class Round(BaseModel):
    id: str
    player_id: str = Field(serialization_alias="playerId")
    course_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("course_id", "courseId"),
        serialization_alias="courseId",
    )
    tee_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("tee_name", "teeName"),
        serialization_alias="teeName",
    )
    holes: int = 18
    started_at: datetime = Field(serialization_alias="startedAt")
    ended_at: datetime | None = Field(default=None, serialization_alias="endedAt")

    model_config = ConfigDict(populate_by_name=True)


class Shot(BaseModel):
    id: str
    round_id: str = Field(serialization_alias="roundId")
    player_id: str = Field(serialization_alias="playerId")
    hole_number: int = Field(serialization_alias="holeNumber")
    club: str
    created_at: datetime = Field(serialization_alias="createdAt")
    start_lat: float = Field(serialization_alias="startLat")
    start_lon: float = Field(serialization_alias="startLon")
    end_lat: float | None = Field(default=None, serialization_alias="endLat")
    end_lon: float | None = Field(default=None, serialization_alias="endLon")
    wind_speed_mps: float | None = Field(
        default=None, serialization_alias="windSpeedMps"
    )
    wind_direction_deg: float | None = Field(
        default=None, serialization_alias="windDirectionDeg"
    )
    elevation_delta_m: float | None = Field(
        default=None, serialization_alias="elevationDeltaM"
    )
    note: str | None = None
    tempo_backswing_ms: int | None = Field(
        default=None, serialization_alias="tempoBackswingMs"
    )
    tempo_downswing_ms: int | None = Field(
        default=None, serialization_alias="tempoDownswingMs"
    )
    tempo_ratio: float | None = Field(default=None, serialization_alias="tempoRatio")

    model_config = ConfigDict(populate_by_name=True)


@dataclass
class RoundRecord:
    id: str
    player_id: str
    course_id: str | None
    tee_name: str | None
    holes: int
    started_at: datetime
    ended_at: datetime | None

    def to_round(self) -> Round:
        return Round(
            id=self.id,
            player_id=self.player_id,
            course_id=self.course_id,
            tee_name=self.tee_name,
            holes=self.holes,
            started_at=self.started_at,
            ended_at=self.ended_at,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "player_id": self.player_id,
            "course_id": self.course_id,
            "tee_name": self.tee_name,
            "holes": self.holes,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
        }

    @staticmethod
    def from_dict(data: dict) -> "RoundRecord":
        return RoundRecord(
            id=data["id"],
            player_id=data["player_id"],
            course_id=data.get("course_id"),
            tee_name=data.get("tee_name"),
            holes=int(data.get("holes", 18)),
            started_at=_parse_dt(data["started_at"]),
            ended_at=_parse_dt(data.get("ended_at")) if data.get("ended_at") else None,
        )


@dataclass
class ShotRecord:
    id: str
    round_id: str
    player_id: str
    hole_number: int
    club: str
    created_at: datetime
    start_lat: float
    start_lon: float
    end_lat: float | None
    end_lon: float | None
    wind_speed_mps: float | None
    wind_direction_deg: float | None
    elevation_delta_m: float | None
    note: str | None
    tempo_backswing_ms: int | None = None
    tempo_downswing_ms: int | None = None
    tempo_ratio: float | None = None

    def to_shot(self) -> Shot:
        return Shot(
            id=self.id,
            round_id=self.round_id,
            player_id=self.player_id,
            hole_number=self.hole_number,
            club=self.club,
            created_at=self.created_at,
            start_lat=self.start_lat,
            start_lon=self.start_lon,
            end_lat=self.end_lat,
            end_lon=self.end_lon,
            wind_speed_mps=self.wind_speed_mps,
            wind_direction_deg=self.wind_direction_deg,
            elevation_delta_m=self.elevation_delta_m,
            note=self.note,
            tempo_backswing_ms=self.tempo_backswing_ms,
            tempo_downswing_ms=self.tempo_downswing_ms,
            tempo_ratio=self.tempo_ratio,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "round_id": self.round_id,
            "player_id": self.player_id,
            "hole_number": self.hole_number,
            "club": self.club,
            "created_at": self.created_at.isoformat(),
            "start_lat": self.start_lat,
            "start_lon": self.start_lon,
            "end_lat": self.end_lat,
            "end_lon": self.end_lon,
            "wind_speed_mps": self.wind_speed_mps,
            "wind_direction_deg": self.wind_direction_deg,
            "elevation_delta_m": self.elevation_delta_m,
            "note": self.note,
            "tempo_backswing_ms": self.tempo_backswing_ms,
            "tempo_downswing_ms": self.tempo_downswing_ms,
            "tempo_ratio": self.tempo_ratio,
        }

    @staticmethod
    def from_dict(data: dict) -> "ShotRecord":
        return ShotRecord(
            id=data["id"],
            round_id=data["round_id"],
            player_id=data["player_id"],
            hole_number=int(data["hole_number"]),
            club=data["club"],
            created_at=_parse_dt(data["created_at"]),
            start_lat=float(data["start_lat"]),
            start_lon=float(data["start_lon"]),
            end_lat=_optional_float(data.get("end_lat")),
            end_lon=_optional_float(data.get("end_lon")),
            wind_speed_mps=_optional_float(data.get("wind_speed_mps")),
            wind_direction_deg=_optional_float(data.get("wind_direction_deg")),
            elevation_delta_m=_optional_float(data.get("elevation_delta_m")),
            note=data.get("note"),
            tempo_backswing_ms=_optional_int(data.get("tempo_backswing_ms")),
            tempo_downswing_ms=_optional_int(data.get("tempo_downswing_ms")),
            tempo_ratio=_optional_float(data.get("tempo_ratio")),
        )


def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _optional_float(value: Optional[float]) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _optional_int(value: Optional[int]) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


ROUNDS_DIR = Path("data/rounds")

__all__ = ["Round", "Shot", "RoundRecord", "ShotRecord", "ROUNDS_DIR"]
