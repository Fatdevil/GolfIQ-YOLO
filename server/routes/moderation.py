from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel

from server.auth import ADMIN_ROLE, require_admin
from server.schemas.moderation import (
    ClipModerationState,
    ModerationAction,
    ReportIn,
    ReportOut,
    Visibility,
)
from server.security import require_api_key
from server.services import clips_repo, moderation_repo, telemetry as telemetry_service
from server.services.clips_repo import ClipNotFoundError

router = APIRouter(tags=["moderation"])

_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW = 60.0
_RATE_LIMIT_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)


def reset_rate_limiter() -> None:
    """Reset in-memory rate limiting buckets (used in tests)."""

    _RATE_LIMIT_BUCKETS.clear()


def _enforce_rate_limit(ip_address: str) -> None:
    now = time.time()
    bucket = _RATE_LIMIT_BUCKETS[ip_address]
    while bucket and now - bucket[0] > _RATE_LIMIT_WINDOW:
        bucket.popleft()
    if len(bucket) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many reports, please try again later",
        )
    bucket.append(now)


def _normalize_role(role: str | None) -> str:
    return (role or "").lower()


def _can_view_clip(
    state: ClipModerationState,
    *,
    role: str,
    member_id: str | None,
) -> bool:
    if role == ADMIN_ROLE:
        return True
    if state.hidden:
        return False
    if state.visibility is Visibility.public:
        return True
    if state.visibility is Visibility.private:
        return False
    if member_id:
        return True
    return False


def _augment_clip(record: dict, state: ClipModerationState) -> dict:
    payload = clips_repo.to_public(record)
    payload["hidden"] = state.hidden
    payload["visibility"] = state.visibility.value
    return payload


@router.post(
    "/clips/{clip_id}/report",
    response_model=ReportOut,
    status_code=status.HTTP_201_CREATED,
)
async def report_clip(clip_id: str, payload: ReportIn, request: Request) -> ReportOut:
    client = request.client
    ip_address = client.host if client and client.host else "anonymous"
    _enforce_rate_limit(ip_address)
    report = moderation_repo.record_report(
        clip_id,
        reason=payload.reason,
        details=payload.details,
        reporter=payload.reporter,
    )
    telemetry_service.emit_clip_reported(
        clip_id,
        reason=payload.reason,
        reporter=payload.reporter,
    )
    return report


@router.get(
    "/admin/moderation/queue",
    response_model=list[ClipModerationState],
    dependencies=[Depends(require_api_key)],
)
def get_moderation_queue(
    status_filter: str = Query(default="open", alias="status"),
    member_id: str | None = Depends(require_admin),
) -> list[ClipModerationState]:
    _ = member_id  # force admin guard
    return moderation_repo.list_queue(status=status_filter)


class ModerationActionBody(BaseModel):
    action: ModerationAction
    visibility: Visibility | None = None


@router.post(
    "/admin/moderation/{clip_id}/action",
    response_model=ClipModerationState,
    dependencies=[Depends(require_api_key)],
)
def apply_moderation_action(
    clip_id: str,
    body: ModerationActionBody,
    member_id: str | None = Depends(require_admin),
) -> ClipModerationState:
    previous = moderation_repo.get_state(clip_id)
    if body.action is ModerationAction.set_visibility and body.visibility is None:
        raise HTTPException(
            status_code=400, detail="visibility required for set_visibility action"
        )
    try:
        updated = moderation_repo.apply_action(
            clip_id,
            action=body.action,
            visibility=body.visibility,
            performed_by=member_id,
        )
    except ValueError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    previous_visibility = previous.visibility
    if body.action is ModerationAction.hide and not previous.hidden and updated.hidden:
        telemetry_service.emit_clip_moderation_hide(clip_id, member_id)
    elif (
        body.action is ModerationAction.unhide
        and previous.hidden
        and not updated.hidden
    ):
        telemetry_service.emit_clip_moderation_unhide(clip_id, member_id)
    if (
        body.action is ModerationAction.set_visibility
        and updated.visibility != previous_visibility
        and body.visibility is not None
    ):
        telemetry_service.emit_clip_visibility_changed(
            clip_id,
            visibility=updated.visibility.value,
            member_id=member_id,
        )
    return updated


@router.get("/clips/{clip_id}")
def read_clip(
    clip_id: str,
    role: str | None = Header(default=None, alias="x-event-role"),
    member_id: str | None = Header(default=None, alias="x-event-member"),
) -> dict:
    normalized_role = _normalize_role(role)
    try:
        record = clips_repo.get_clip(clip_id)
    except ClipNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="clip not found"
        ) from exc
    state = moderation_repo.get_state(clip_id)
    if state.hidden and normalized_role != ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="clip not found"
        )
    if not _can_view_clip(state, role=normalized_role, member_id=member_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="clip not visible"
        )
    return _augment_clip(record, state)


@router.get("/events/{event_id}/clips-feed")
def list_event_clips(
    event_id: str,
    role: str | None = Header(default=None, alias="x-event-role"),
    member_id: str | None = Header(default=None, alias="x-event-member"),
) -> list[dict]:
    normalized_role = _normalize_role(role)
    results: list[dict] = []
    for record in clips_repo.list_for_event(event_id):
        clip_id = record.get("id") or record.get("clipId")
        if not clip_id:
            continue
        state = moderation_repo.get_state(str(clip_id))
        if state.hidden and normalized_role != ADMIN_ROLE:
            continue
        if not _can_view_clip(state, role=normalized_role, member_id=member_id):
            continue
        results.append(_augment_clip(record, state))
    results.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return results


__all__ = ["router", "reset_rate_limiter"]
