"""API surface for caddie advice."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.caddie.advise import advise
from server.caddie.schemas import AdviseIn, AdviseOut
from server.club_distance.profiles import (
    ShotShapeIntent,
    ShotShapeProfile,
    build_shot_shape_profile,
)
from server.club_distance.service import (
    ClubDistanceService,
    get_club_distance_service,
)

router = APIRouter(dependencies=[Depends(require_api_key)])


def _derive_player_id(api_key: str | None, user_id: str | None) -> str:
    return user_id or api_key or "anonymous"


@router.post("/api/caddie/advise", response_model=AdviseOut)
def post_advise(body: AdviseIn) -> AdviseOut:
    """Return plays-like distance and club advice."""
    return advise(body)


@router.get("/api/caddie/shot-shape-profile", response_model=ShotShapeProfile)
def get_shot_shape_profile(
    club: str = Query(...),
    intent: ShotShapeIntent = Query("straight"),
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: ClubDistanceService = Depends(get_club_distance_service),
) -> ShotShapeProfile:
    player_id = _derive_player_id(api_key, user_id)
    stats = service.get_stats_for_club(player_id, club)
    return build_shot_shape_profile(stats, intent)


__all__ = ["router"]
