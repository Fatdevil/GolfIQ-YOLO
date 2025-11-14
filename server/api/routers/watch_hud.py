"""API endpoints for watch HUD payloads."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from server.courses.schemas import GeoPoint
from server.security import require_api_key
from server.watch.hud_schemas import HoleHud, HudTip
from server.watch.hud_service import build_hole_hud

router = APIRouter(dependencies=[Depends(require_api_key)])


class HudQuery(BaseModel):
    memberId: str
    runId: str
    hole: int
    courseId: str | None = None
    lat: float | None = None
    lon: float | None = None
    wind_mps: float | None = None
    wind_dir_deg: float | None = None
    temp_c: float | None = None
    elev_delta_m: float | None = None


@router.post("/api/watch/hud/hole", response_model=HoleHud)
def get_hole_hud(payload: HudQuery) -> HoleHud:
    """Return a full HUD snapshot for the requested hole."""

    gnss = None
    if payload.lat is not None and payload.lon is not None:
        gnss = GeoPoint(lat=payload.lat, lon=payload.lon)

    return build_hole_hud(
        payload.memberId,
        payload.runId,
        payload.hole,
        course_id=payload.courseId,
        gnss=gnss,
        wind_mps=payload.wind_mps,
        wind_dir_deg=payload.wind_dir_deg,
        temp_c=payload.temp_c,
        elev_delta_m=payload.elev_delta_m,
    )


class TickIn(BaseModel):
    memberId: str
    runId: str
    hole: int
    deviceId: str
    courseId: str | None = None
    lat: float | None = None
    lon: float | None = None
    wind_mps: float | None = None
    wind_dir_deg: float | None = None
    temp_c: float | None = None
    elev_delta_m: float | None = None


class TickOut(BaseModel):
    hole: int
    courseId: str | None = None
    toGreen_m: float | None = None
    toFront_m: float | None = None
    toBack_m: float | None = None
    playsLike_m: float | None = None
    caddie_confidence: float | None = None
    caddie_silent: bool = False
    caddie_silent_reason: str | None = None
    activeTip: HudTip | None = None
    hasNewTip: bool = False


@router.post("/api/watch/hud/tick", response_model=TickOut)
def post_hud_tick(payload: TickIn) -> TickOut:
    """Lightweight heartbeat endpoint that returns minimal HUD deltas."""

    gnss = None
    if payload.lat is not None and payload.lon is not None:
        gnss = GeoPoint(lat=payload.lat, lon=payload.lon)

    hud = build_hole_hud(
        payload.memberId,
        payload.runId,
        payload.hole,
        course_id=payload.courseId,
        gnss=gnss,
        wind_mps=payload.wind_mps,
        wind_dir_deg=payload.wind_dir_deg,
        temp_c=payload.temp_c,
        elev_delta_m=payload.elev_delta_m,
    )
    has_new_tip = hud.activeTip is not None
    return TickOut(
        hole=hud.hole,
        courseId=hud.courseId,
        toGreen_m=hud.toGreen_m,
        toFront_m=hud.toFront_m,
        toBack_m=hud.toBack_m,
        playsLike_m=hud.playsLike_m,
        caddie_confidence=hud.caddie_confidence,
        caddie_silent=hud.caddie_silent,
        caddie_silent_reason=hud.caddie_silent_reason,
        activeTip=hud.activeTip,
        hasNewTip=has_new_tip,
    )
