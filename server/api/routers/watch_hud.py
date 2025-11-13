"""API endpoints for watch HUD payloads."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from server.security import require_api_key
from server.watch.hud_schemas import HoleHud, HudTip
from server.watch.hud_service import build_hole_hud

router = APIRouter(dependencies=[Depends(require_api_key)])


class HudQuery(BaseModel):
    memberId: str
    runId: str
    hole: int


@router.post("/api/watch/hud/hole", response_model=HoleHud)
def get_hole_hud(payload: HudQuery) -> HoleHud:
    """Return a full HUD snapshot for the requested hole."""

    return build_hole_hud(payload.memberId, payload.runId, payload.hole)


class TickIn(BaseModel):
    memberId: str
    runId: str
    hole: int
    deviceId: str
    lat: float | None = None
    lon: float | None = None
    wind_mps: float | None = None
    wind_dir_deg: float | None = None
    temp_c: float | None = None


class TickOut(BaseModel):
    hole: int
    toGreen_m: float | None = None
    playsLike_m: float | None = None
    activeTip: HudTip | None = None
    hasNewTip: bool = False


@router.post("/api/watch/hud/tick", response_model=TickOut)
def post_hud_tick(payload: TickIn) -> TickOut:
    """Lightweight heartbeat endpoint that returns minimal HUD deltas."""

    hud = build_hole_hud(payload.memberId, payload.runId, payload.hole)
    has_new_tip = hud.activeTip is not None
    return TickOut(
        hole=hud.hole,
        toGreen_m=hud.toGreen_m,
        playsLike_m=hud.playsLike_m,
        activeTip=hud.activeTip,
        hasNewTip=has_new_tip,
    )
