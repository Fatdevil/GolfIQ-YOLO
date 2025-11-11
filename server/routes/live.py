"""Routes for managing event live streams and viewer tokens."""

from __future__ import annotations

import os
from time import time
from urllib.parse import quote_plus

try:  # pragma: no cover - FastAPI always provides pydantic
    from pydantic import BaseModel
except ImportError:  # pragma: no cover
    BaseModel = object  # type: ignore[assignment]

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from server.auth import require_admin
from server.security import require_api_key
from server.services import live_stream, telemetry as telemetry_service, viewer_token

router = APIRouter(
    prefix="/events/{event_id}/live",
    tags=["live"],
    dependencies=[Depends(require_api_key)],
)

_EXCHANGE_LIMIT = 10
_EXCHANGE_WINDOW_S = 60
_exchange_attempts: dict[tuple[str, str], list[float]] = {}


def _web_base_url() -> str:
    base = (
        os.getenv("WEB_BASE_URL")
        or os.getenv("EXPO_PUBLIC_WEB_BASE")
        or os.getenv("APP_BASE_URL")
    )
    return (base or "https://app.golfiq.dev").rstrip("/")


def _client_identifier(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _check_exchange_rate_limit(event_id: str, request: Request) -> None:
    now = time()
    key = (event_id, _client_identifier(request))
    entries = _exchange_attempts.setdefault(key, [])
    entries[:] = [ts for ts in entries if now - ts < _EXCHANGE_WINDOW_S]
    if len(entries) >= _EXCHANGE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many invite exchanges",
        )
    entries.append(now)


class StartLiveRequest(BaseModel):
    source: str = "mock"


class MintTokenRequest(BaseModel):
    ttl: int = 900


class ExchangeInviteRequest(BaseModel):
    invite: str


@router.post("/start")
def start_live_route(
    event_id: str,
    body: StartLiveRequest | None = None,
    member_id: str | None = Depends(require_admin),
) -> dict[str, str]:
    _ = member_id
    payload = body or StartLiveRequest()
    try:
        response = live_stream.start_live(event_id, source=payload.source)
    except RuntimeError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_409_CONFLICT
            if "already running" in detail
            else status.HTTP_503_SERVICE_UNAVAILABLE
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return response


@router.post("/stop")
def stop_live_route(
    event_id: str, member_id: str | None = Depends(require_admin)
) -> dict[str, bool]:
    _ = member_id
    return live_stream.stop_live(event_id)


@router.post("/token")
def mint_token_route(
    event_id: str,
    body: MintTokenRequest | None = None,
    member_id: str | None = Depends(require_admin),
) -> dict[str, int | str]:
    _ = member_id
    payload = body or MintTokenRequest()
    ttl = max(int(payload.ttl), 1)
    status_payload = live_stream.status_live(event_id)
    if not status_payload.get("running"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="live stream not running",
        )
    try:
        minted = viewer_token.mint_viewer_token(event_id, ttl_s=ttl)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    metadata = viewer_token.decode_token(minted["token"]) or {}
    viewer_id = metadata.get("viewerId")
    exp = int(metadata.get("exp", minted.get("exp", 0)))
    telemetry_service.emit_live_token_minted(
        event_id,
        viewer_id=viewer_id or "unknown",
        exp=exp,
        ttl_s=ttl,
    )
    return minted


@router.get("/status")
def status_route(
    event_id: str,
    token: str | None = Query(default=None),
) -> dict[str, object | None]:
    status_payload = live_stream.status_live(event_id)
    viewer_id: str | None = None
    token_valid = False
    if token:
        try:
            token_valid = viewer_token.verify_viewer_token(event_id, token)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
            ) from exc
        metadata = viewer_token.decode_token(token) or {}
        viewer_id = metadata.get("viewerId")
        if token_valid:
            status_payload = live_stream.status_live(event_id)
        else:
            status_payload.pop("hlsPath", None)
        telemetry_service.emit_live_status(
            event_id,
            running=bool(status_payload.get("running")),
            token_valid=token_valid,
            viewer_id=viewer_id,
        )
        return status_payload

    telemetry_service.emit_live_status(
        event_id,
        running=bool(status_payload.get("running")),
        token_valid=False,
        viewer_id=None,
    )
    status_payload.pop("hlsPath", None)
    return status_payload


@router.get("/viewer_link")
def viewer_link_route(
    event_id: str,
    member_id: str | None = Depends(require_admin),
) -> dict[str, str]:
    status_payload = live_stream.status_live(event_id)
    if not status_payload.get("running"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="live stream not running",
        )
    try:
        minted = viewer_token.mint_invite(event_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    invite = minted.get("invite")
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="failed to mint viewer invite",
        )
    exp = int(minted.get("exp", 0))
    ttl = max(exp - int(time()), 0)
    telemetry_service.emit_live_invite_minted(
        event_id,
        exp=exp,
        ttl_s=ttl,
        member_id=member_id,
    )
    telemetry_service.emit_live_viewer_link_copied(
        event_id,
        viewer_id="invite",
        exp=exp,
    )
    base = _web_base_url()
    url = f"{base}/events/{event_id}/live-view?invite={quote_plus(invite)}"
    return {"url": url}


@router.post("/exchange_invite")
def exchange_invite_route(
    request: Request,
    event_id: str,
    body: ExchangeInviteRequest,
) -> dict[str, object]:
    if not body.invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invite required",
        )

    _check_exchange_rate_limit(event_id, request)

    try:
        exchanged = viewer_token.exchange_invite(body.invite)
    except ValueError as exc:
        telemetry_service.emit_live_invite_exchange(
            event_id,
            ok=False,
            reason="invalid_invite",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        telemetry_service.emit_live_invite_exchange(
            event_id,
            ok=False,
            reason="signing_disabled",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if exchanged.get("eventId") != event_id:
        telemetry_service.emit_live_invite_exchange(
            event_id,
            ok=False,
            reason="invite_event_mismatch",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invite does not match event",
        )

    telemetry_service.emit_live_invite_exchange(
        event_id,
        ok=True,
        viewer_id=exchanged.get("viewerId"),
    )
    return {
        "token": exchanged["token"],
        "exp": exchanged["exp"],
    }
