from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.user.history_models import (
    QuickRoundSnapshot,
    RangeSessionSnapshot,
    UserHistory,
)
from server.user.history_service import (
    add_quickrounds,
    add_range_sessions,
    list_quickrounds,
    list_range_sessions,
)

router = APIRouter(
    prefix="/api/user/history",
    tags=["user-history"],
    dependencies=[Depends(require_api_key)],
)


def _require_user_id(user_id: str | None) -> str:
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id_required")
    return user_id


@router.get("/quickrounds", response_model=List[QuickRoundSnapshot])
def get_quickrounds(user_id: UserIdHeader = None):
    uid = _require_user_id(user_id)
    return list_quickrounds(uid)


@router.post("/quickrounds", response_model=UserHistory)
def post_quickrounds(items: List[QuickRoundSnapshot], user_id: UserIdHeader = None):
    uid = _require_user_id(user_id)
    return add_quickrounds(uid, items)


@router.get("/rangesessions", response_model=List[RangeSessionSnapshot])
def get_range_sessions(user_id: UserIdHeader = None):
    uid = _require_user_id(user_id)
    return list_range_sessions(uid)


@router.post("/rangesessions", response_model=UserHistory)
def post_range_sessions(
    items: List[RangeSessionSnapshot], user_id: UserIdHeader = None
):
    uid = _require_user_id(user_id)
    return add_range_sessions(uid, items)
