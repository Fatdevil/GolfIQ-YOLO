"""Share endpoints for clip anchors and recaps."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal
from html import escape
from urllib.parse import urljoin, urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from server.api.user_header import UserIdHeader
from server.features import is_clip_public
from server.security import require_api_key
from server.rounds.models import compute_round_category_stats, compute_round_summary
from server.rounds.service import (
    RoundNotFound,
    RoundOwnershipError,
    RoundService,
    get_round_service,
)
from server.rounds.recap import StrokesGainedLightSummary, _build_strokes_gained_light
from server.rounds.weekly_summary import (
    _select_completed_rounds,
    build_weekly_summary_response,
)
from server.services.anchors_store import get_one
from server.services.shortlinks import ShortLink, build_shortlink_url, create, get
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


class RoundSharePayload(BaseModel):
    roundId: str | None = None
    courseName: str | None = None
    score: int | None = None
    toPar: str | None = None
    date: str | None = None
    headline: str | None = None
    highlights: list[str] = Field(default_factory=list)
    strokesGainedLight: StrokesGainedLightSummary | None = None

    model_config = {"populate_by_name": True}


class WeeklyPeriod(BaseModel):
    start: str | None = Field(default=None, serialization_alias="from")
    end: str | None = Field(default=None, serialization_alias="to")

    model_config = {"populate_by_name": True}


class WeeklySharePayload(BaseModel):
    period: WeeklyPeriod | None = None
    roundCount: int | None = None
    avgScore: float | None = None
    headline: str | None = None
    highlights: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class CoachSharePayload(BaseModel):
    runId: str | None = None
    summary: dict[str, Any] | None = None


class ShareResolveResponse(BaseModel):
    sid: str
    type: Literal["round", "weekly", "coach", "anchor", "unknown"]
    round: RoundSharePayload | None = None
    weekly: WeeklySharePayload | None = None
    coach: CoachSharePayload | None = None
    url: str | None = None


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


def _format_to_par(value: int | None) -> str | None:
    if value is None:
        return None
    if value == 0:
        return "E"
    prefix = "+" if value > 0 else ""
    return f"{prefix}{value}"


def _format_date(value: str | datetime | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    try:
        parsed = datetime.fromisoformat(value)
        return parsed.date().isoformat()
    except ValueError:
        return value


def _infer_share_type(
    shortlink: ShortLink,
) -> Literal["round", "weekly", "coach", "anchor", "unknown"]:
    payload = shortlink.payload or {}
    kind = str(payload.get("kind") or "").lower()
    if kind == "round_recap":
        return "round"
    if kind == "weekly_summary":
        return "weekly"
    if kind.startswith("coach"):
        return "coach"
    if shortlink.clip_id:
        return "anchor"
    return "unknown"


def _round_share_from_payload(shortlink: ShortLink) -> RoundSharePayload:
    payload = shortlink.payload or {}
    summary = payload.get("summary") or {}
    highlights = payload.get("highlights") or []
    headline = payload.get("headline") or summary.get("headline")
    date_value = (
        payload.get("ended_at") or payload.get("endedAt") or summary.get("endedAt")
    )
    score = summary.get("totalStrokes") or summary.get("total_strokes")
    to_par = summary.get("totalToPar") or summary.get("total_to_par")

    sg_light_raw = payload.get("strokes_gained_light") or payload.get(
        "strokesGainedLight"
    )
    sg_light = None
    if sg_light_raw:
        try:
            sg_light = StrokesGainedLightSummary.model_validate(sg_light_raw)
        except Exception:
            sg_light = None

    return RoundSharePayload(
        roundId=payload.get("round_id") or payload.get("roundId"),
        courseName=payload.get("course_name")
        or payload.get("courseName")
        or payload.get("course_id"),
        score=score,
        toPar=_format_to_par(to_par),
        date=_format_date(date_value),
        headline=headline,
        highlights=[str(item) for item in highlights if item],
        strokesGainedLight=sg_light,
    )


def _weekly_share_from_payload(shortlink: ShortLink) -> WeeklySharePayload:
    payload = shortlink.payload or {}
    summary = payload.get("summary") or {}
    period = summary.get("period") or {}
    core_stats = summary.get("coreStats") or {}
    headline = summary.get("headline")
    focus_hints = summary.get("focusHints") or []
    headline_text: str | None = None
    if isinstance(headline, dict):
        headline_text = headline.get("text")
    elif isinstance(headline, str):
        headline_text = headline

    highlights: list[str] = []
    if isinstance(focus_hints, list):
        highlights = [str(item) for item in focus_hints if item]

    return WeeklySharePayload(
        period=WeeklyPeriod(start=period.get("from"), end=period.get("to")),
        roundCount=period.get("roundCount"),
        avgScore=core_stats.get("avgScore"),
        headline=headline_text,
        highlights=highlights,
    )


def _coach_share_from_payload(shortlink: ShortLink) -> CoachSharePayload:
    payload = shortlink.payload or {}
    return CoachSharePayload(
        runId=payload.get("run_id") or payload.get("runId"),
        summary=payload.get("summary"),
    )


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
    sg_light_summary = None
    try:
        category_stats = compute_round_category_stats(scores)
        sg_light_summary = _build_strokes_gained_light(summary, category_stats)
    except Exception:
        sg_light_summary = None

    payload = {
        "kind": "round_recap",
        "round_id": round_id,
        "player_id": player_id,
        "summary": summary.model_dump(),
        "course_name": info.course_name or info.course_id,
        "ended_at": (info.ended_at or info.started_at).isoformat(),
    }

    if sg_light_summary:
        payload["strokes_gained_light"] = sg_light_summary.model_dump()

    description = "Shared round recap"
    if info.course_id:
        description = f"Round recap for {info.course_id}"

    shortlink = create(
        url=lambda sid: f"/s/{sid}?share=round",
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
        url=lambda sid: f"/s/{sid}?share=weekly",
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


@router.get("/share/resolve/{sid}", response_model=ShareResolveResponse)
def resolve_share_link(sid: str) -> ShareResolveResponse:
    """
    Resolves a shortlink sid into a public share payload.
    Does NOT require auth; the payload is already intended to be shareable.
    """

    shortlink = get(sid)
    if not shortlink or (shortlink.clip_id and not is_clip_public(shortlink.clip_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share link not found")

    share_type = _infer_share_type(shortlink)
    response = ShareResolveResponse(sid=sid, type=share_type)

    if share_type == "round":
        response.round = _round_share_from_payload(shortlink)
    elif share_type == "weekly":
        response.weekly = _weekly_share_from_payload(shortlink)
    elif share_type == "coach":
        response.coach = _coach_share_from_payload(shortlink)
    elif share_type == "anchor":
        response.url = shortlink.url

    emit("share.resolve", {"sid": sid, "type": share_type})
    return response


@router.get("/s/{sid}")
def resolve_shortlink(sid: str, request: Request):
    shortlink = get(sid)
    if not shortlink:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    if shortlink.clip_id and not is_clip_public(shortlink.clip_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")

    share_type = _infer_share_type(shortlink)
    share_destination = (
        shortlink.url
        if shortlink.url.startswith("/s/")
        else (
            f"/s/{sid}?share={share_type}"
            if share_type in {"round", "weekly", "coach"}
            else shortlink.url
        )
    )
    destination = (
        _absolute(str(request.base_url), share_destination) or share_destination
    )

    emit("share.anchor.open", {"sid": sid})
    if str(request.url) == destination:
        destination = f"/s/{sid}?share={share_type or 'share'}"
    return RedirectResponse(url=destination, status_code=status.HTTP_302_FOUND)


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
    "resolve_share_link",
    "resolve_shortlink",
    "shortlink_og",
    "get_share_payload",
]
