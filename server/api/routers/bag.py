from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.bag.service import PlayerBagService, get_player_bag_service
from server.bag.models import PlayerBagPublic

router = APIRouter(prefix="/api/player", tags=["bag"])


def _derive_player_id(api_key: str | None, user_id: str | None) -> str:
    return user_id or api_key or "anonymous"


class ClubUpdateIn(BaseModel):
    club_id: str = Field(alias="clubId")
    label: str | None = None
    active: bool | None = None
    manual_avg_carry_m: float | None = Field(default=None, alias="manualAvgCarryM")

    model_config = ConfigDict(populate_by_name=True)


@router.get("/bag", response_model=PlayerBagPublic)
def get_player_bag(
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: PlayerBagService = Depends(get_player_bag_service),
) -> PlayerBagPublic:
    player_id = _derive_player_id(api_key, user_id)
    bag = service.get_bag(player_id)
    return service.to_public(bag)


@router.post("/bag/clubs", response_model=PlayerBagPublic)
def update_clubs(
    payload: list[ClubUpdateIn],
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: PlayerBagService = Depends(get_player_bag_service),
) -> PlayerBagPublic:
    player_id = _derive_player_id(api_key, user_id)
    updates = []
    for item in payload:
        update_payload = item.model_dump(exclude_unset=True)
        update_payload["club_id"] = item.club_id
        updates.append(update_payload)

    bag = service.update_clubs(player_id, updates)
    return service.to_public(bag)


__all__ = ["router", "get_player_bag", "update_clubs"]
