"""Pydantic models for the watch HUD contract."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class MapPoint(BaseModel):
    """Lat/lon representation for map overlays."""

    lat: float
    lon: float


class HudTip(BaseModel):
    """Compact tip payload for watch consumption."""

    tipId: str
    title: str
    body: str
    club: Optional[str] = None
    playsLike_m: Optional[float] = None


class HoleHud(BaseModel):
    """Full watch HUD snapshot for a single hole."""

    eventId: Optional[str] = None
    runId: Optional[str] = None
    memberId: Optional[str] = None

    courseId: Optional[str] = None
    hole: int
    par: Optional[int] = None
    strokeIndex: Optional[int] = None

    # Distances are all "remaining to target" in meters
    toGreen_m: Optional[float] = None
    toFront_m: Optional[float] = None
    toBack_m: Optional[float] = None
    toLayup_m: Optional[float] = None

    # Plays-like adjustment for the *next* shot
    playsLike_m: Optional[float] = None

    # Caddie meta
    caddie_confidence: Optional[float] = None
    caddie_silent: bool = False
    caddie_silent_reason: Optional[str] = None

    # Wind + env snapshot
    wind_mps: Optional[float] = None
    wind_dir_deg: Optional[float] = None
    temp_c: Optional[float] = None
    elev_delta_m: Optional[float] = None

    # Shot context
    shotsTaken: int = 0
    sg_delta_total: Optional[float] = None
    sg_delta_last_shot: Optional[float] = None

    # Map polyline for hole (optional)
    fairway_path: Optional[List[MapPoint]] = None
    green_center: Optional[MapPoint] = None
    ball_position: Optional[MapPoint] = None

    # Latest tip (if any) not yet ACKed on this device
    activeTip: Optional[HudTip] = None
