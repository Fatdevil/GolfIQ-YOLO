"""Share endpoints for clip anchors and recaps."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from html import escape
from urllib.parse import urljoin, urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from server.api.user_header import UserIdHeader
from server.features import is_clip_public
from server.security import require_api_key
from server.rounds.models import compute_round_summary
from server.rounds.service import (
    RoundNotFound,
    RoundOwnershipError,
    RoundService,
    get_round_service,
)
from server.rounds.weekly_summary import (
    _select_completed_rounds,
    build_weekly_summary_response,
)
from server.services.anchors_store import get_one
from server.services.shortlinks import build_shortlink_url, create, get
from server.services.telemetry import emit
from server.utils.media import rewrite_media_url

router = APIRouter()


class AnchorShareIn(BaseModel):
    runId: str
    hole: int
    shot: int


class ShareLinkResponse(BaseModel):
    url: str
    sid: str


def _absolute(base: str, value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        return value
    if value.startswith("/"):
        return f"{base.rstrip('/')}{value}"
    return urljoin(f"{base.rstrip('/')}/", value)


def _derive_player_id(api_key: str | None, user_id: str | None) -> str:
    return user_id or api_key or "anonymous"


@router.post("/api/share/anchor", dependencies=[Depends(require_api_key)])
def post_share_anchor(body: AnchorShareIn, request: Request):
    anchor = get_one(body.runId, body.hole, body.shot)
    if not anchor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "anchor not found")
    if not is_clip_public(anchor.clipId):
        raise HTTPException(status.HTTP_409_CONFLICT, "clip not public")

    seek_ms = max(0, int(anchor.tStartMs))
    canonical_url = f"/clip/{anchor.clipId}?t={seek_ms}"
    title = f"GolfIQ • H{anchor.hole} S{anchor.shot}"
    description = "Shot highlight (Strokes-Gained) – watch from the exact moment."
    image = rewrite_media_url(f"/media/{anchor.clipId}/thumb.jpg")

    shortlink = create(
        url=canonical_url,
        title=title,
        description=description,
        image=image,
        clip_id=anchor.clipId,
    )
    emit("share.anchor.create", {"sid": shortlink.sid, "clipId": anchor.clipId})
    short_url = build_shortlink_url(str(request.base_url), shortlink.sid)
    return {
        "sid": shortlink.sid,
        "url": short_url,
        "ogUrl": f"{short_url}/o",
    }


@router.post("/api/share/round/{round_id}", response_model=ShareLinkResponse)
def create_round_share_link(
    round_id: str,
    request: Request,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> ShareLinkResponse:
    player_id = _derive_player_id(api_key, user_id)

    try:
        info = service.get_round_info(player_id=player_id, round_id=round_id)
        scores = service.get_scores(player_id=player_id, round_id=round_id)
    except RoundNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "round not found") from None
    except RoundOwnershipError:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "round not owned by user"
        ) from None

    summary = compute_round_summary(scores)
    payload = {
        "kind": "round_recap",
        "round_id": round_id,
        "player_id": player_id,
        "summary": summary.model_dump(),
    }

    description = "Shared round recap"
    if info.course_id:
        description = f"Round recap for {info.course_id}"

    shortlink = create(
        url=lambda sid: f"/share/round/{sid}",
        title="GolfIQ • Round recap",
        description=description,
        image=None,
        payload=payload,
    )

    emit("share.round.create", {"sid": shortlink.sid, "roundId": round_id})
    return ShareLinkResponse(
        url=build_shortlink_url(str(request.base_url), shortlink.sid), sid=shortlink.sid
    )


@router.post("/api/share/weekly", response_model=ShareLinkResponse)
def create_weekly_share_link(
    request: Request,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> ShareLinkResponse:
    player_id = _derive_player_id(api_key, user_id)
    now = datetime.now(timezone.utc)

    round_infos = service.list_rounds(player_id=player_id, limit=50)
    selected_infos = _select_completed_rounds(round_infos, now=now)

    summaries = [
        compute_round_summary(service.get_scores(player_id=player_id, round_id=info.id))
        for info in selected_infos
    ]

    remaining_rounds = [
        info for info in round_infos if info.id not in {r.id for r in selected_infos}
    ]
    comparison_infos = _select_completed_rounds(remaining_rounds, now=now)
    comparison_summaries = [
        compute_round_summary(service.get_scores(player_id=player_id, round_id=info.id))
        for info in comparison_infos
    ]

    summary_payload = build_weekly_summary_response(
        summaries=summaries,
        comparison_summaries=comparison_summaries,
        round_infos=selected_infos,
        now=now,
    )

    shortlink = create(
        url=lambda sid: f"/share/weekly/{sid}",
        title="GolfIQ • Weekly summary",
        description="Shared weekly performance",
        image=None,
        payload={
            "kind": "weekly_summary",
            "player_id": player_id,
            "summary": summary_payload,
        },
    )

    emit(
        "share.weekly.create",
        {
            "sid": shortlink.sid,
            "roundCount": summary_payload.get("period", {}).get("roundCount", 0),
        },
    )
    return ShareLinkResponse(
        url=build_shortlink_url(str(request.base_url), shortlink.sid), sid=shortlink.sid
    )


@router.get("/s/{sid}")
def resolve_shortlink(sid: str):
    shortlink = get(sid)
    if not shortlink:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    if shortlink.clip_id and not is_clip_public(shortlink.clip_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")

    emit("share.anchor.open", {"sid": sid})
    return RedirectResponse(url=shortlink.url, status_code=status.HTTP_302_FOUND)


@router.get("/s/{sid}/o")
def shortlink_og(sid: str, request: Request):
    shortlink = get(sid)
    if not shortlink:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    if shortlink.clip_id and not is_clip_public(shortlink.clip_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")

    emit("share.anchor.og", {"sid": sid})

    base_url = str(request.base_url).rstrip("/")
    destination = _absolute(base_url, shortlink.url) or shortlink.url
    image_url = _absolute(base_url, shortlink.image) if shortlink.image else None

    title = escape(shortlink.title)
    description = escape(shortlink.description)
    og_url = escape(destination)
    og_image = escape(image_url or "")
    script_dest = json.dumps(destination)

    html = f"""<!doctype html>
<html><head>
<meta charset=\"utf-8\"/>
<meta property=\"og:type\" content=\"video.other\"/>
<meta property=\"og:title\" content=\"{title}\"/>
<meta property=\"og:description\" content=\"{description}\"/>
<meta property=\"og:image\" content=\"{og_image}\"/>
<meta property=\"og:url\" content=\"{og_url}\"/>
<meta name=\"twitter:card\" content=\"summary_large_image\"/>
<meta name=\"twitter:title\" content=\"{title}\"/>
<meta name=\"twitter:description\" content=\"{description}\"/>
<meta name=\"twitter:image\" content=\"{og_image}\"/>
</head><body>
<script>location.replace({script_dest});</script>
</body></html>"""
    return HTMLResponse(content=html, media_type="text/html")


@router.get("/api/share/{sid}")
def get_share_payload(sid: str):
    shortlink = get(sid)
    if not shortlink:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    if shortlink.clip_id and not is_clip_public(shortlink.clip_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    if shortlink.payload is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")

    emit("share.anchor.payload", {"sid": sid})
    return shortlink.payload


__all__ = [
    "router",
    "post_share_anchor",
    "create_round_share_link",
    "create_weekly_share_link",
    "resolve_shortlink",
    "shortlink_og",
    "get_share_payload",
]
