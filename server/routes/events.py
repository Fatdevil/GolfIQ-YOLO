from __future__ import annotations

import os
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Tuple

from fastapi import APIRouter, Body, Depends, HTTPException, Path, status
from pydantic import BaseModel, ConfigDict, Field

from server.security import require_api_key
from server.telemetry.events import (
    record_board_resync,
    record_event_created,
    record_event_joined,
)


from server.utils.qr_svg import qr_svg

router = APIRouter(
    prefix="/events", tags=["events"], dependencies=[Depends(require_api_key)]
)
join_router = APIRouter(tags=["events"])  # Join endpoint is public for spectators.


ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ALPHABET_SIZE = len(ALPHABET)


class CreateEventBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    emoji: str | None = Field(default=None, max_length=4)


class CreateEventResponse(BaseModel):
    id: str
    code: str
    joinUrl: str
    qrSvg: str | None = None


class JoinRequest(BaseModel):
    member_id: str | None = Field(default=None, alias="memberId")
    name: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class JoinResponse(BaseModel):
    eventId: str = Field(alias="eventId")


class SpectatorPlayer(BaseModel):
    name: str
    gross: int
    net: float | None = None
    thru: int
    hole: int
    status: str | None = None


class BoardResponse(BaseModel):
    players: List[SpectatorPlayer]
    updatedAt: str | None = None


def _web_base_url() -> str:
    base = (
        os.getenv("WEB_BASE_URL")
        or os.getenv("EXPO_PUBLIC_WEB_BASE")
        or os.getenv("APP_BASE_URL")
    )
    return (base or "https://app.golfiq.dev").rstrip("/")


def _random_indexes(count: int) -> List[int]:
    if count <= 0:
        return []
    from secrets import token_bytes

    result: List[int] = []
    max_multiple = (256 // ALPHABET_SIZE) * ALPHABET_SIZE
    while len(result) < count:
        for byte in token_bytes(count):
            if byte < max_multiple:
                result.append(byte % ALPHABET_SIZE)
                if len(result) == count:
                    break
    return result


def _compute_checksum(values: Iterable[int]) -> int:
    acc = 0
    for index, value in enumerate(values, start=1):
        acc = (acc + value * index) % ALPHABET_SIZE
    return acc


def generate_code() -> str:
    body = _random_indexes(6)
    checksum = _compute_checksum(body)
    indexes = [*body, checksum]
    return "".join(ALPHABET[i] for i in indexes)


def validate_code(code: str) -> bool:
    if not isinstance(code, str) or len(code) != 7:
        return False
    values: List[int] = []
    for char in code:
        try:
            values.append(ALPHABET.index(char))
        except ValueError:
            return False
    checksum = values.pop()
    return _compute_checksum(values) == checksum


def _parse_timestamp(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if not (value == value):  # NaN check
            return None
        # Handle ms timestamps
        if value > 1e12:
            return value / 1000.0
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        text = text.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    return None


def _format_timestamp(ts: float | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return int(value)
        return int(float(str(value)))
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return float(value)
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _sanitize_player(row: Mapping[str, Any]) -> Tuple[SpectatorPlayer, Dict[str, Any]]:
    name_source = row.get("name") or row.get("display_name") or "Player"
    name = str(name_source).strip() or "Player"
    gross = _to_int(row.get("gross"))
    net = _to_float(row.get("net"))
    thru = _to_int(row.get("thru") or row.get("holes") or row.get("holes_played"))
    hole = _to_int(row.get("hole") or row.get("current_hole") or thru)
    status_val = row.get("status") or row.get("state")
    status = str(status_val) if status_val not in (None, "") else None

    sanitized = SpectatorPlayer(
        name=name,
        gross=gross if gross is not None else 0,
        net=net,
        thru=thru if thru is not None else 0,
        hole=hole if hole is not None else 0,
        status=status,
    )

    meta = {
        "last_under_par": row.get("last_under_par_at") or row.get("under_par_at"),
        "finished_at": row.get("finished_at") or row.get("completed_at"),
        "updated_at": row.get("updated_at") or row.get("last_updated") or row.get("ts"),
    }
    return sanitized, meta


def build_board(
    rows: Iterable[Mapping[str, Any]],
) -> Tuple[List[SpectatorPlayer], str | None]:
    enriched: List[Tuple[SpectatorPlayer, Tuple[float, float, float, float, str]]] = []
    updated_ts: List[float] = []
    for raw in rows:
        player, meta = _sanitize_player(raw)
        net = player.net if player.net is not None else float("inf")
        gross = float(player.gross)
        last_under_par_ts = _parse_timestamp(meta.get("last_under_par"))
        finished_ts = _parse_timestamp(meta.get("finished_at"))
        updated = _parse_timestamp(meta.get("updated_at"))
        if updated is not None:
            updated_ts.append(updated)
        sort_key = (
            net,
            gross,
            last_under_par_ts if last_under_par_ts is not None else float("inf"),
            finished_ts if finished_ts is not None else float("inf"),
            player.name.lower(),
        )
        enriched.append((player, sort_key))

    enriched.sort(key=lambda item: item[1])
    players = [item[0] for item in enriched]
    updated_at = _format_timestamp(max(updated_ts)) if updated_ts else None
    return players, updated_at


@dataclass
class _Member:
    event_id: str
    member_id: str
    name: str | None
    role: str


class _MemoryEventsRepository:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: Dict[str, Dict[str, Any]] = {}
        self._codes: Dict[str, str] = {}
        self._members: Dict[Tuple[str, str], _Member] = {}
        self._boards: Dict[str, List[Dict[str, Any]]] = {}

    def create_event(
        self, name: str, emoji: str | None, *, code: str
    ) -> Dict[str, Any]:
        with self._lock:
            event_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            event = {"id": event_id, "name": name, "emoji": emoji, "created_at": now}
            self._events[event_id] = event
            self._codes[code] = event_id
            self._boards[event_id] = [
                {
                    "name": f"{name} Captain",
                    "gross": 0,
                    "net": None,
                    "thru": 0,
                    "hole": 1,
                    "status": "pending",
                    "coach": "hidden",
                    "updated_at": now,
                }
            ]
            return event

    def resolve_event_by_code(self, code: str) -> Dict[str, Any] | None:
        with self._lock:
            event_id = self._codes.get(code)
            if not event_id:
                return None
            return self._events.get(event_id)

    def add_member(
        self, event_id: str, *, member_id: str, name: str | None, role: str
    ) -> None:
        with self._lock:
            member = _Member(
                event_id=event_id, member_id=member_id, name=name, role=role
            )
            self._members[(event_id, member_id)] = member
            board = self._boards.setdefault(event_id, [])
            board.append(
                {
                    "name": name or f"Spectator {member_id[:4]}",
                    "gross": 0,
                    "net": None,
                    "thru": 0,
                    "hole": 1,
                    "status": role,
                    "last_under_par_at": None,
                    "finished_at": None,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "coach": "hidden",
                }
            )

    def get_board(self, event_id: str) -> List[Mapping[str, Any]]:
        with self._lock:
            board = self._boards.get(event_id)
            if board is None:
                return []
            return [dict(row) for row in board]


_REPOSITORY = _MemoryEventsRepository()


@router.post(
    "",
    response_model=CreateEventResponse,
    status_code=status.HTTP_201_CREATED,
    response_model_exclude_none=True,
)
def create_event(body: CreateEventBody) -> CreateEventResponse:
    code = generate_code()
    event = _REPOSITORY.create_event(body.name, body.emoji, code=code)
    join_url = f"{_web_base_url()}/join/{code}"
    svg = qr_svg(join_url)
    record_event_created(event["id"], code, name=body.name)
    response = CreateEventResponse(id=event["id"], code=code, joinUrl=join_url)
    if svg is not None:
        response.qrSvg = svg
    return response


@join_router.post("/join/{code}", response_model=JoinResponse)
def join_event(
    code: str = Path(..., min_length=7, max_length=7),
    body: JoinRequest = Body(default_factory=JoinRequest),
) -> JoinResponse:
    normalized = code.strip().upper()
    if not validate_code(normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid code"
        )
    event = _REPOSITORY.resolve_event_by_code(normalized)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
        )
    member_id = body.member_id or str(uuid.uuid4())
    _REPOSITORY.add_member(
        event["id"], member_id=member_id, name=body.name, role="spectator"
    )
    record_event_joined(event["id"], member_id)
    return JoinResponse(eventId=event["id"])


@router.get("/{event_id}/board", response_model=BoardResponse)
def get_board(event_id: str) -> BoardResponse:
    rows = _REPOSITORY.get_board(event_id)
    if not rows:
        record_board_resync(event_id, reason="empty", attempt=1)
    players, updated_at = build_board(rows)
    return BoardResponse(players=players, updatedAt=updated_at)


__all__ = ["router", "join_router", "build_board", "generate_code", "validate_code"]
