from fastapi import APIRouter, Depends

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.caddie.bag_stats import BagClubStats, compute_bag_stats
from server.rounds.service import RoundService, get_round_service

router = APIRouter(prefix="/api/player", tags=["bag-stats"])


def _derive_player_id(api_key: str | None, user_id: str | None) -> str:
    return user_id or api_key or "anonymous"


@router.get("/bag-stats", response_model=dict[str, BagClubStats])
def get_bag_stats(
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    rounds: RoundService = Depends(get_round_service),
) -> dict[str, BagClubStats]:
    player_id = _derive_player_id(api_key, user_id)
    shots = rounds.list_recent_shots(player_id=player_id)
    return compute_bag_stats(shots)


__all__ = ["router", "get_bag_stats"]
