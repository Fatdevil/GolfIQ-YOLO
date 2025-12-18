from __future__ import annotations

from fastapi import APIRouter, Depends

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.feature_flags import get_feature_flags

router = APIRouter()


@router.get("/api/feature-flags")
def fetch_feature_flags(
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
):
    member_id = user_id or api_key or "anonymous"
    evaluated = get_feature_flags(member_id)
    return {
        "version": 1,
        "flags": {
            name: {
                "enabled": flag.enabled,
                "rolloutPct": flag.rollout_pct,
                "source": flag.source,
            }
            for name, flag in evaluated.items()
        },
    }


__all__ = ["router", "fetch_feature_flags"]
