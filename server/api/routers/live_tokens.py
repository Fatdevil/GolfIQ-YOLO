"""API endpoints for minting and refreshing signed live viewer tokens."""

from __future__ import annotations

import os
import time
from typing import Final

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from server.security import require_api_key
from server.services.live_state import as_state
from server.utils.media import rewrite_media_url
from server.services.live_signing import sign_url

router = APIRouter(dependencies=[Depends(require_api_key)])


class ViewerTokenOut(BaseModel):
    viewerUrl: str
    expTs: int
    ttlSec: int


LIVE_SIGN_TTL: Final[int] = int(os.getenv("LIVE_SIGN_TTL_SEC", "120"))
LIVE_SIGN_SECRET: Final[str] = os.getenv("LIVE_SIGN_SECRET", "dev-secret-change-me")


@router.post("/api/events/{event_id}/live/viewer-token", response_model=ViewerTokenOut)
def mint_viewer_token(event_id: str) -> ViewerTokenOut:
    state = as_state(
        event_id,
        ttl_seconds=int(os.getenv("LIVE_HEARTBEAT_TTL_SEC", "120")),
        default_latency=os.getenv("LIVE_LATENCY_MODE"),
    )
    if not state.isLive or not state.viewerUrl:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "event not live")

    signed_url, exp = sign_url(state.viewerUrl, LIVE_SIGN_SECRET, LIVE_SIGN_TTL)
    rewritten = rewrite_media_url(signed_url)
    if not rewritten:
        rewritten = signed_url

    return ViewerTokenOut(viewerUrl=rewritten, expTs=exp, ttlSec=LIVE_SIGN_TTL)


class RefreshOut(BaseModel):
    viewerUrl: str
    expTs: int
    refreshed: bool


@router.get("/api/events/{event_id}/live/refresh", response_model=RefreshOut)
def refresh_viewer_token(
    event_id: str, expTs: int, minRemainingSec: int = 30
) -> RefreshOut:
    now = int(time.time())
    if expTs - now >= minRemainingSec:
        return RefreshOut(viewerUrl="", expTs=expTs, refreshed=False)

    minted = mint_viewer_token(event_id)
    return RefreshOut(viewerUrl=minted.viewerUrl, expTs=minted.expTs, refreshed=True)
