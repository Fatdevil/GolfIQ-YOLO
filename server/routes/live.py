"""Routes for managing event live streams and viewer tokens."""

from __future__ import annotations

try:  # pragma: no cover - FastAPI always provides pydantic
    from pydantic import BaseModel
except ImportError:  # pragma: no cover
    BaseModel = object  # type: ignore[assignment]

from fastapi import APIRouter, Depends, HTTPException, Query, status

from server.auth import require_admin
from server.security import require_api_key
from server.services import live_stream, telemetry as telemetry_service, viewer_token

router = APIRouter(
    prefix="/events/{event_id}/live",
    tags=["live"],
    dependencies=[Depends(require_api_key)],
)


class StartLiveRequest(BaseModel):
    source: str = "mock"


class MintTokenRequest(BaseModel):
    ttl: int = 900


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
        if not token_valid:
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
