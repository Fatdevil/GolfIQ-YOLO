"""Pydantic schemas for the lightweight caddie advice service."""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class EnvIn(BaseModel):
    """Shot environment inputs."""

    wind_mps: float = 0.0
    wind_dir_deg: float = 0.0  # meteorological degrees wind blowing FROM
    temp_c: float = 20.0
    elev_delta_m: float = 0.0  # +uphill, -downhill (optional)


class ShotContext(BaseModel):
    """Describes the shot to be played."""

    before_m: float = Field(..., gt=0)
    target_bearing_deg: float = 0.0  # direction TO target (0°=N, clockwise)
    lie: str = "fairway"  # tee|fairway|rough|sand|recovery|green


class PlayerBag(BaseModel):
    """Average carry distances per club."""

    carries_m: Dict[str, float]


class AdviseIn(BaseModel):
    """Request body for advice generation."""

    runId: Optional[str] = None
    hole: Optional[int] = None
    shotNumber: Optional[int] = None
    shot: ShotContext
    env: EnvIn
    bag: PlayerBag


class AdviseOut(BaseModel):
    """Advice response payload."""

    playsLike_m: float
    club: str
    reasoning: List[str]
