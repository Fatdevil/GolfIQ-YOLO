"""Event session endpoint providing role and safety gating."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Literal, Mapping, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from server.auth import ADMIN_ROLE

from . import events as events_routes


SAFE_KEYS = ("safe", "tournamentSafe", "tournament_safe")


class EventSessionResponse(BaseModel):
    role: Literal["admin", "spectator"]
    member_id: str | None = Field(default=None, alias="memberId")
    safe: bool = False
    tournament_safe: bool = Field(default=False, alias="tournamentSafe")
    ts: int

    model_config = ConfigDict(populate_by_name=True)


router = APIRouter(prefix="/events", tags=["events-session"])


def _normalize_member_id(member_id: Optional[str]) -> Optional[str]:
    if member_id is None:
        return None
    candidate = member_id.strip()
    return candidate or None


def _extract_from_mapping(mapping: Mapping[str, object] | None) -> Optional[bool]:
    if not isinstance(mapping, Mapping):
        return None
    for key in SAFE_KEYS:
        value = mapping.get(key)
        if isinstance(value, bool):
            return value
    return None


def _iter_host_candidates(event: Mapping[str, object]) -> Iterable[str]:
    potential = []
    for key in (
        "host",
        "owner",
        "hostMemberId",
        "host_member_id",
        "ownerId",
        "owner_id",
    ):
        value = event.get(key)
        if value is None:
            continue
        if isinstance(value, Mapping):
            for inner_key in ("memberId", "member_id", "id"):
                inner_value = value.get(inner_key)
                if isinstance(inner_value, str):
                    potential.append(inner_value)
        elif isinstance(value, str):
            potential.append(value)
    return potential


def _resolve_role(
    event_id: str, event: Mapping[str, object], member_id: Optional[str]
) -> str:
    if not member_id:
        return "spectator"
    stored = events_routes._REPOSITORY.get_member(event_id, member_id)
    if stored and stored.role.lower() in {ADMIN_ROLE, "host"}:
        return "admin"
    for candidate in _iter_host_candidates(event):
        if candidate.strip() == member_id:
            return "admin"
    return "spectator"


def _resolve_safe_flag(event_id: str, event: Mapping[str, object]) -> bool:
    host_state = None
    try:
        host_state = events_routes._build_host_state(event_id)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            raise
    except Exception:
        host_state = None

    if host_state is not None:
        for key in SAFE_KEYS:
            candidate = getattr(host_state, key, None)
            if isinstance(candidate, bool):
                return candidate
        if hasattr(host_state, "model_dump"):
            dumped = host_state.model_dump()
            value = _extract_from_mapping(dumped)
            if value is not None:
                return value
            dumped_alias = host_state.model_dump(by_alias=True)
            value_alias = _extract_from_mapping(dumped_alias)
            if value_alias is not None:
                return value_alias
            nested = dumped.get("tvFlags") or dumped_alias.get("tvFlags")
            nested_value = _extract_from_mapping(nested)
            if nested_value is not None:
                return nested_value

    value = _extract_from_mapping(event)
    if value is not None:
        return value
    settings = event.get("settings") if isinstance(event, Mapping) else None
    if isinstance(settings, Mapping):
        value = _extract_from_mapping(settings)
        if value is not None:
            return value
        flags = settings.get("tvFlags")
        nested_value = _extract_from_mapping(
            flags if isinstance(flags, Mapping) else None
        )
        if nested_value is not None:
            return nested_value
    return False


@router.get("/{event_id}/session", response_model=EventSessionResponse)
def get_event_session(
    event_id: str,
    member_id: str | None = Query(default=None, alias="memberId"),
) -> EventSessionResponse:
    normalized_member = _normalize_member_id(member_id)
    event = events_routes._REPOSITORY.get_event(event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
        )
    role = _resolve_role(event_id, event, normalized_member)
    safe = _resolve_safe_flag(event_id, event)
    return EventSessionResponse(
        role=role,
        memberId=normalized_member,
        safe=safe,
        tournamentSafe=safe,
        ts=int(datetime.now(timezone.utc).timestamp()),
    )


__all__ = ["router"]
