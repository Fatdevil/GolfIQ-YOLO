from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from typing import Literal

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


class ClubDistanceOverrideRequest(BaseModel):
    manual_carry_m: float = Field(gt=0, alias="manualCarryM")
    source: Literal["auto", "manual"] = "manual"

    model_config = ConfigDict(populate_by_name=True)


@router.get("/club-distances", response_model=list[ClubDistanceStats])
def get_club_distances(
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: ClubDistanceService = Depends(get_club_distance_service),
) -> list[ClubDistanceStats]:
    player_id = _derive_player_id(api_key, user_id)
    profile = service.get_profile(player_id)
    return list(profile.clubs.values())


@router.put(
    "/club-distances/{club}/override", response_model=ClubDistanceStats
)
def set_club_distance_override(
    club: str,
    override: ClubDistanceOverrideRequest,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: ClubDistanceService = Depends(get_club_distance_service),
) -> ClubDistanceStats:
    player_id = _derive_player_id(api_key, user_id)
    return service.set_manual_override(
        player_id, club, override.manual_carry_m, override.source
    )


@router.delete(
    "/club-distances/{club}/override", response_model=ClubDistanceStats
)
def clear_club_distance_override(
    club: str,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: ClubDistanceService = Depends(get_club_distance_service),
) -> ClubDistanceStats:
    player_id = _derive_player_id(api_key, user_id)
    return service.clear_manual_override(player_id, club)


__all__ = [
    "router",
    "get_club_distances",
    "set_club_distance_override",
    "clear_club_distance_override",
]
