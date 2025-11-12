"""Share endpoints for clip anchors."""

from __future__ import annotations

import json
from html import escape
from urllib.parse import urljoin, urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from server.features import is_clip_public
from server.security import require_api_key
from server.services.anchors_store import get_one
from server.services.shortlinks import create, get
from server.services.telemetry import emit
from server.utils.media import rewrite_media_url

router = APIRouter()


class AnchorShareIn(BaseModel):
    runId: str
    hole: int
    shot: int


def _absolute(base: str, value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        return value
    if value.startswith("/"):
        return f"{base.rstrip('/')}{value}"
    return urljoin(f"{base.rstrip('/')}/", value)


@router.post("/api/share/anchor", dependencies=[Depends(require_api_key)])
def post_share_anchor(body: AnchorShareIn):
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
    return {
        "sid": shortlink.sid,
        "url": f"/s/{shortlink.sid}",
        "ogUrl": f"/s/{shortlink.sid}/o",
    }


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


__all__ = [
    "router",
    "post_share_anchor",
    "resolve_shortlink",
    "shortlink_og",
]
