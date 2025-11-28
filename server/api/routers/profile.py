from fastapi import APIRouter, Depends, HTTPException, status

from server.access.service import determine_plan
from server.api.user_header import UserIdHeader
from server.schemas.player_profile import PlayerProfile
from server.security import require_api_key
from server.services.player_profile import build_player_profile

router = APIRouter()


def require_pro_plan(api_key: str | None = Depends(require_api_key)) -> str | None:
    plan = determine_plan(api_key).plan
    if plan != "pro":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="pro plan required"
        )
    return api_key


def _derive_member_id(api_key: str | None, user_id: str | None) -> str:
    return user_id or api_key or "anonymous"


@router.get("/api/profile/player", response_model=PlayerProfile)
def get_player_profile(
    api_key: str | None = Depends(require_pro_plan),
    user_id: UserIdHeader = None,
) -> PlayerProfile:
    member_id = _derive_member_id(api_key, user_id)
    return build_player_profile(member_id)


__all__ = ["router", "get_player_profile"]
