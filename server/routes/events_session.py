"""Event session endpoint providing role and safety gating."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Literal, Mapping, Optional, Sequence

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from server.auth import ADMIN_ROLE

from . import events as events_routes


SAFE_KEYS = ("safe", "tournamentSafe", "tournament_safe")
TOURNAMENT_SAFE_KEYS = ("tournamentSafe", "tournament_safe")


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


def _extract_from_mapping(
    mapping: Mapping[str, object] | None, keys: Sequence[str] = SAFE_KEYS
) -> Optional[bool]:
    if not isinstance(mapping, Mapping):
        return None
    for key in keys:
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


def _extract_from_host_state(host_state: object, keys: Sequence[str]) -> Optional[bool]:
    if host_state is None:
        return None
    for key in keys:
        candidate = getattr(host_state, key, None)
        if isinstance(candidate, bool):
            return candidate
    if hasattr(host_state, "model_dump"):
        dumped = host_state.model_dump()
        value = _extract_from_mapping(dumped, keys)
        if value is not None:
            return value
        dumped_alias = host_state.model_dump(by_alias=True)
        alias_value = _extract_from_mapping(dumped_alias, keys)
        if alias_value is not None:
            return alias_value
        nested = None
        if isinstance(dumped, Mapping):
            nested = dumped.get("tvFlags")
        if nested is None and isinstance(dumped_alias, Mapping):
            nested = dumped_alias.get("tvFlags")
        nested_value = _extract_from_mapping(nested, keys)
        if nested_value is not None:
            return nested_value
    if isinstance(host_state, Mapping):
        value = _extract_from_mapping(host_state, keys)
        if value is not None:
            return value
        nested_value = _extract_from_mapping(host_state.get("tvFlags"), keys)
        if nested_value is not None:
            return nested_value
    return None


def _resolve_flag_from_sources(
    host_state: object, event: Mapping[str, object], keys: Sequence[str]
) -> Optional[bool]:
    value = _extract_from_host_state(host_state, keys)
    if value is not None:
        return value

    value = _extract_from_mapping(event, keys)
    if value is not None:
        return value

    settings = event.get("settings") if isinstance(event, Mapping) else None
    if isinstance(settings, Mapping):
        value = _extract_from_mapping(settings, keys)
        if value is not None:
            return value
        flags = settings.get("tvFlags")
        nested_value = _extract_from_mapping(
            flags if isinstance(flags, Mapping) else None, keys
        )
        if nested_value is not None:
            return nested_value

    return None


def _resolve_safe_and_tournament_flags(
    event_id: str, event: Mapping[str, object]
) -> tuple[bool, bool]:
    host_state: object | None = None
    try:
        host_state = events_routes._build_host_state(event_id)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            raise
    except Exception:
        host_state = None

    safe_value = _resolve_flag_from_sources(host_state, event, SAFE_KEYS)
    tournament_value = _resolve_flag_from_sources(
        host_state, event, TOURNAMENT_SAFE_KEYS
    )

    if tournament_value is None:
        tournament_value = safe_value

    return bool(safe_value), bool(tournament_value)


def _resolve_safe_flag(event_id: str, event: Mapping[str, object]) -> bool:
    safe, _ = _resolve_safe_and_tournament_flags(event_id, event)
    return safe


def _resolve_tournament_safe_flag(event_id: str, event: Mapping[str, object]) -> bool:
    _, tournament = _resolve_safe_and_tournament_flags(event_id, event)
    return tournament


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
    safe, tournament_safe = _resolve_safe_and_tournament_flags(event_id, event)
    return EventSessionResponse(
        role=role,
        memberId=normalized_member,
        safe=safe,
        tournamentSafe=tournament_safe,
        ts=int(datetime.now(timezone.utc).timestamp()),
    )


__all__ = ["router"]
