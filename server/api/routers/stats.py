from __future__ import annotations

from fastapi import APIRouter, Depends

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.rounds.service import RoundService, get_round_service
from server.rounds.stats import PlayerCategoryStats, compute_player_category_stats

router = APIRouter(
    prefix="/api/stats", tags=["stats"], dependencies=[Depends(require_api_key)]
)


def _derive_player_id(api_key: str | None, user_id: str | None) -> str:
    return user_id or api_key or "anonymous"


@router.get("/player/categories", response_model=PlayerCategoryStats)
async def get_player_category_stats(
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> PlayerCategoryStats:
    player_id = _derive_player_id(api_key, user_id)
    summaries = service.get_round_summaries(player_id=player_id, limit=100)
    return compute_player_category_stats(summaries, player_id)


__all__ = ["router"]
