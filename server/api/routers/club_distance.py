from __future__ import annotations

from fastapi import APIRouter, Depends

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.club_distance import (
    ClubDistanceService,
    ClubDistanceStats,
    get_club_distance_service,
)

router = APIRouter(prefix="/api/player", tags=["club-distance"])


def _derive_player_id(api_key: str | None, user_id: str | None) -> str:
    return user_id or api_key or "anonymous"


@router.get("/club-distances", response_model=list[ClubDistanceStats])
def get_club_distances(
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: ClubDistanceService = Depends(get_club_distance_service),
) -> list[ClubDistanceStats]:
    player_id = _derive_player_id(api_key, user_id)
    profile = service.get_profile(player_id)
    return list(profile.clubs.values())


__all__ = ["router", "get_club_distances"]
