from __future__ import annotations

from server.bag.defaults import DEFAULT_DISTANCE_TABLE_M
from server.bag.service import PlayerBagService, get_player_bag_service


def get_player_club_carries(
    player_id: str, service: PlayerBagService | None = None
) -> dict[str, float]:
    svc = service or get_player_bag_service()
    carries = svc.get_carries_map(player_id)
    return carries or DEFAULT_DISTANCE_TABLE_M


__all__ = ["get_player_club_carries"]
