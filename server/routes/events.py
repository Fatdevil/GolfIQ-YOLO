from __future__ import annotations

import os
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, List, Mapping, Tuple

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Path,
    Query,
    status,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID

from server.auth import require_admin
from server.security import require_api_key
from server.services import commentary
from server.telemetry.events import (
    record_board_build,
    record_board_resync,
    record_event_created,
    record_event_joined,
    record_host_action,
    record_score_conflict,
    record_score_conflict_stale_or_duplicate,
    record_score_idempotent,
    record_score_write,
)


from server.utils.qr_svg import qr_svg, qr_svg_placeholder

router = APIRouter(
    prefix="/events", tags=["events"], dependencies=[Depends(require_api_key)]
)
join_router = APIRouter(tags=["events"])  # Join endpoint is public for spectators.


ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ALPHABET_SIZE = len(ALPHABET)

DEFAULT_TV_FLAGS: Dict[str, Any] = {
    "showQrOverlay": False,
    "autoRotateTop": True,
    "rotateIntervalMs": None,
}
DEFAULT_GROSS_NET = "net"
VALID_GROSS_NET = {"gross", "net", "stableford"}


def _normalize_gross_net(value: Any) -> str:
    if isinstance(value, str) and value.lower() in VALID_GROSS_NET:
        return value.lower()
    return DEFAULT_GROSS_NET


def _normalize_tv_flags(flags: Mapping[str, Any] | None) -> Dict[str, Any]:
    merged: Dict[str, Any] = dict(DEFAULT_TV_FLAGS)
    if not isinstance(flags, Mapping):
        return merged
    if "showQrOverlay" in flags:
        merged["showQrOverlay"] = bool(flags.get("showQrOverlay"))
    if "autoRotateTop" in flags:
        merged["autoRotateTop"] = bool(flags.get("autoRotateTop"))
    if "rotateIntervalMs" in flags:
        try:
            candidate = flags.get("rotateIntervalMs")
            if candidate is None:
                merged["rotateIntervalMs"] = None
            else:
                merged["rotateIntervalMs"] = max(0, int(candidate))
        except (TypeError, ValueError):
            merged["rotateIntervalMs"] = merged["rotateIntervalMs"]
    return merged


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
    stableford: float | None = None
    thru: int
    hole: int
    status: str | None = None


class CommentaryOut(BaseModel):
    title: str
    summary: str
    ttsUrl: str | None = None


class TvFlagsModel(BaseModel):
    show_qr_overlay: bool = Field(default=False, alias="showQrOverlay")
    auto_rotate_top: bool = Field(default=True, alias="autoRotateTop")
    rotate_interval_ms: int | None = Field(default=None, alias="rotateIntervalMs")

    model_config = ConfigDict(populate_by_name=True)


class BoardResponse(BaseModel):
    players: List[SpectatorPlayer]
    updatedAt: str | None = None
    grossNet: str = Field(default="net", alias="grossNet")
    tvFlags: TvFlagsModel = Field(default_factory=TvFlagsModel, alias="tvFlags")
    participants: int = 0
    spectators: int = 0
    qrSvg: str | None = Field(default=None, alias="qrSvg")

    model_config = ConfigDict(populate_by_name=True)


class RegisterEventPlayer(BaseModel):
    scorecard_id: str | None = Field(default=None, alias="scorecardId")
    name: str = Field(..., min_length=1, max_length=120)
    member_id: str | None = Field(default=None, alias="memberId")
    hcp_index: float | None = Field(default=None, alias="hcpIndex")
    course_handicap: int | None = Field(default=None, alias="courseHandicap")
    playing_handicap: int | None = Field(default=None, alias="playingHandicap")
    status: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class RegisterPlayersBody(BaseModel):
    players: List[RegisterEventPlayer]


class EventPlayerState(BaseModel):
    scorecard_id: str = Field(alias="scorecardId")
    name: str
    member_id: str | None = Field(default=None, alias="memberId")
    hcp_index: float | None = Field(default=None, alias="hcpIndex")
    course_handicap: int | None = Field(default=None, alias="courseHandicap")
    playing_handicap: int | None = Field(default=None, alias="playingHandicap")
    updated_at: str = Field(alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)


class RegisterPlayersResponse(BaseModel):
    players: List[EventPlayerState]


class ScoreWriteBody(BaseModel):
    scorecard_id: str = Field(..., alias="scorecardId")
    hole: int = Field(..., ge=1, le=36)
    gross: int = Field(..., ge=0)
    net: int | None = None
    stableford: int | None = None
    par: int | None = None
    to_par: int | None = Field(default=None, alias="toPar")
    strokes_received: int | None = Field(default=None, alias="strokesReceived")
    playing_handicap: int | None = Field(default=None, alias="playingHandicap")
    course_handicap: int | None = Field(default=None, alias="courseHandicap")
    hcp_index: float | None = Field(default=None, alias="hcpIndex")
    revision: int | None = None
    fingerprint: str | None = None
    format: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class ScoreWriteResponse(BaseModel):
    status: str
    revision: int | None = None
    updated_at: str = Field(alias="updatedAt")
    idempotent: bool | None = None

    model_config = ConfigDict(populate_by_name=True)


class HostStateResponse(BaseModel):
    id: str
    name: str
    status: str
    code: str
    joinUrl: str
    grossNet: str = Field(default="net", alias="grossNet")
    tvFlags: TvFlagsModel = Field(default_factory=TvFlagsModel, alias="tvFlags")
    participants: int = 0
    spectators: int = 0
    qrSvg: str | None = Field(default=None, alias="qrSvg")

    model_config = ConfigDict(populate_by_name=True)


class UpdateSettingsBody(BaseModel):
    grossNet: str | None = Field(default=None, alias="grossNet")
    tvFlags: TvFlagsModel | None = Field(default=None, alias="tvFlags")

    model_config = ConfigDict(populate_by_name=True)


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
    stableford = _to_float(row.get("stableford"))
    thru = _to_int(row.get("thru") or row.get("holes") or row.get("holes_played"))
    hole = _to_int(row.get("hole") or row.get("current_hole") or thru)
    status_val = row.get("status") or row.get("state")
    status = str(status_val) if status_val not in (None, "") else None

    sanitized = SpectatorPlayer(
        name=name,
        gross=gross if gross is not None else 0,
        net=net,
        stableford=stableford,
        thru=thru if thru is not None else 0,
        hole=hole if hole is not None else 0,
        status=status,
    )

    meta = {
        "last_under_par": row.get("last_under_par_at") or row.get("under_par_at"),
        "updated_at": row.get("updated_at")
        or row.get("last_updated")
        or row.get("ts")
        or row.get("last_ts"),
    }
    return sanitized, meta


def build_board(
    rows: Iterable[Mapping[str, Any]],
    *,
    mode: str = "net",
) -> Tuple[List[SpectatorPlayer], str | None]:
    enriched: List[Tuple[SpectatorPlayer, Tuple[float, float, float, float, str]]] = []
    updated_ts: List[float] = []
    for raw in rows:
        player, meta = _sanitize_player(raw)
        stableford = (
            float(player.stableford) if player.stableford is not None else float("-inf")
        )
        net = player.net if player.net is not None else float("inf")
        gross = float(player.gross)
        last_under_par_ts = _parse_timestamp(meta.get("last_under_par"))
        updated = _parse_timestamp(meta.get("updated_at"))
        if updated is not None:
            updated_ts.append(updated)
        name_key = player.name.lower()
        recency_key = (
            -updated if updated is not None else float("inf")
        )  # negative for descending recency
        if mode == "gross":
            sort_key = (
                gross,
                net,
                recency_key,
                last_under_par_ts if last_under_par_ts is not None else float("inf"),
                name_key,
            )
        elif mode == "stableford":
            sort_key = (
                -stableford if stableford != float("-inf") else float("inf"),
                gross,
                recency_key,
                last_under_par_ts if last_under_par_ts is not None else float("inf"),
                name_key,
            )
        else:
            sort_key = (
                net,
                gross,
                recency_key,
                last_under_par_ts if last_under_par_ts is not None else float("inf"),
                name_key,
            )
        enriched.append((player, sort_key))

    enriched.sort(key=lambda item: item[1])
    players = [item[0] for item in enriched]
    updated_at = _format_timestamp(max(updated_ts)) if updated_ts else None
    return players, updated_at


@dataclass
class _AggregatedCard:
    gross: int = 0
    net: float = 0.0
    holes: int = 0
    to_par: int = 0
    max_hole: int = 0
    last_ts: float | None = None
    last_iso: str | None = None
    stableford: float = 0.0
    has_stableford: bool = False
    net_from_rows: bool = False
    playing_handicap: int | None = None
    format: str | None = None


def _aggregate_scorecards(
    rows: Iterable[Mapping[str, Any]],
    meta: Mapping[str, Mapping[str, Any]],
    *,
    mode: str,
) -> Tuple[List[SpectatorPlayer], str | None]:
    aggregated: Dict[str, _AggregatedCard] = {}
    updated_candidates: List[float] = []
    for row in rows:
        scorecard_id = str(row.get("scorecard_id") or row.get("scorecardId") or "")
        if not scorecard_id:
            continue
        entry = aggregated.setdefault(scorecard_id, _AggregatedCard())
        gross = _to_int(row.get("gross")) or 0
        net_value = _to_float(row.get("net"))
        hole_no = _to_int(row.get("hole")) or 0
        stableford_value = _to_float(row.get("stableford"))
        to_par_value = _to_int(row.get("to_par") or row.get("toPar"))
        par_value = _to_int(row.get("par"))
        if to_par_value is None and par_value is not None:
            to_par_value = gross - par_value
        entry.gross += gross
        entry.holes += 1
        entry.to_par += to_par_value if to_par_value is not None else 0
        if net_value is not None:
            entry.net += net_value
            if int(round(net_value)) != gross:
                entry.net_from_rows = True
        if stableford_value is not None:
            entry.stableford += stableford_value
            entry.has_stableford = True
        if hole_no > entry.max_hole:
            entry.max_hole = hole_no
        playing_handicap = _safe_int(
            row.get("playing_handicap") or row.get("playingHandicap")
        )
        if playing_handicap is not None:
            entry.playing_handicap = playing_handicap
        row_format = row.get("format")
        if isinstance(row_format, str) and row_format.lower() in VALID_GROSS_NET:
            entry.format = row_format.lower()
        updated = (
            _parse_timestamp(row.get("updated_at"))
            or _parse_timestamp(row.get("updatedAt"))
            or _parse_timestamp(row.get("ts"))
        )
        if updated is not None:
            updated_candidates.append(updated)
            if entry.last_ts is None or updated >= entry.last_ts:
                entry.last_ts = updated
                entry.last_iso = _format_timestamp(updated)

    # Include players with no scores yet
    for scorecard_id, card_meta in meta.items():
        aggregated.setdefault(scorecard_id, _AggregatedCard())
        updated = _parse_timestamp(card_meta.get("updated_at"))
        if updated is not None:
            updated_candidates.append(updated)
            card_entry = aggregated[scorecard_id]
            if card_entry.last_ts is None or updated >= (
                card_entry.last_ts or float("-inf")
            ):
                card_entry.last_ts = updated
                card_entry.last_iso = _format_timestamp(updated)
        elif aggregated[scorecard_id].last_iso is None:
            iso = card_meta.get("created_at")
            if isinstance(iso, str):
                aggregated[scorecard_id].last_iso = iso

    leaderboard: List[Tuple[SpectatorPlayer, Tuple[Any, ...]]] = []
    for scorecard_id, entry in aggregated.items():
        card_meta = meta.get(scorecard_id, {})
        name = str(card_meta.get("name") or "Player")
        holes = entry.holes
        gross_total = entry.gross
        net_total = entry.net
        hcp_index = _safe_float(card_meta.get("hcp_index"))
        if not entry.net_from_rows:
            net_total = _compute_net_simple(gross_total, hcp_index, holes)
        stableford_total: float | None
        if entry.has_stableford:
            stableford_total = entry.stableford
        else:
            stableford_total = None
        if stableford_total is None and mode == "stableford":
            fallback = 2 * holes + gross_total - net_total - entry.to_par
            stableford_total = float(max(0, round(fallback)))
        last_ts = entry.last_ts
        if last_ts is None:
            fallback_updated = _parse_timestamp(card_meta.get("updated_at"))
            if fallback_updated is not None:
                last_ts = fallback_updated
        playing_handicap = entry.playing_handicap
        if playing_handicap is None:
            playing_handicap = _safe_int(card_meta.get("playing_handicap"))
        thru = holes
        next_hole = entry.max_hole + 1 if entry.max_hole > 0 else 1
        net_display: float | None
        if holes > 0 or entry.net_from_rows:
            net_display = float(net_total)
        else:
            net_display = None
        player = SpectatorPlayer(
            name=name,
            gross=int(gross_total),
            net=net_display,
            stableford=stableford_total,
            thru=thru,
            hole=next_hole,
            status=str(card_meta.get("status")) if card_meta.get("status") else None,
        )
        updated_iso = entry.last_iso or card_meta.get("updated_at")
        if updated_iso:
            updated = _parse_timestamp(updated_iso)
            if updated is not None:
                updated_candidates.append(updated)
        name_key = name.lower()
        recency_key = -(last_ts or float("-inf"))
        if mode == "gross":
            sort_key = (
                player.gross,
                player.net if player.net is not None else float("inf"),
                recency_key,
                name_key,
            )
        elif mode == "stableford":
            stableford_key = (
                -float(player.stableford)
                if player.stableford is not None
                else float("inf")
            )
            sort_key = (
                stableford_key,
                player.gross,
                recency_key,
                name_key,
            )
        else:
            sort_key = (
                player.net if player.net is not None else float("inf"),
                player.gross,
                recency_key,
                name_key,
            )
        leaderboard.append((player, sort_key))

    leaderboard.sort(key=lambda item: item[1])
    players = [player for player, _ in leaderboard]
    updated_at = (
        _format_timestamp(max(updated_candidates)) if updated_candidates else None
    )
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
        self._event_codes: Dict[str, str] = {}
        self._event_settings: Dict[str, Dict[str, Any]] = {}
        self._event_status: Dict[str, str] = {}
        self._members: Dict[Tuple[str, str], _Member] = {}
        self._boards: Dict[str, List[Dict[str, Any]]] = {}
        self._scorecards: Dict[str, Dict[str, Dict[str, Any]]] = {}

    def create_event(
        self, name: str, emoji: str | None, *, code: str
    ) -> Dict[str, Any]:
        with self._lock:
            event_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            event = {
                "id": event_id,
                "name": name,
                "emoji": emoji,
                "created_at": now,
                "status": "pending",
                "code": code,
            }
            self._events[event_id] = event
            self._codes[code] = event_id
            self._event_codes[event_id] = code
            self._event_status[event_id] = "pending"
            self._event_settings[event_id] = {
                "grossNet": DEFAULT_GROSS_NET,
                "tvFlags": dict(DEFAULT_TV_FLAGS),
            }
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

    def get_event(self, event_id: str) -> Dict[str, Any] | None:
        with self._lock:
            event = self._events.get(event_id)
            if not event:
                return None
            result = dict(event)
            result["code"] = self._event_codes.get(event_id, result.get("code"))
            result["status"] = self._event_status.get(
                event_id, result.get("status", "pending")
            )
            result["settings"] = self._clone_settings_locked(event_id)
            counts = self._counts_locked(event_id)
            result.update(counts)
            return result

    def register_scorecards(
        self, event_id: str, players: Iterable[Mapping[str, Any]]
    ) -> List[Dict[str, Any]]:
        with self._lock:
            if event_id not in self._events:
                raise KeyError(event_id)
            cards = self._scorecards.setdefault(event_id, {})
            results: List[Dict[str, Any]] = []
            now = datetime.now(timezone.utc).isoformat()
            for payload in players:
                requested = payload.get("scorecard_id") or payload.get("scorecardId")
                scorecard_id = str(requested) if requested else str(uuid.uuid4())
                card = cards.get(scorecard_id)
                if card is None:
                    card = {
                        "scorecard_id": scorecard_id,
                        "name": str(payload.get("name") or "Player"),
                        "member_id": payload.get("member_id")
                        or payload.get("memberId"),
                        "hcp_index": _safe_float(
                            payload.get("hcp_index") or payload.get("hcpIndex")
                        ),
                        "course_handicap": _safe_int(
                            payload.get("course_handicap")
                            or payload.get("courseHandicap")
                        ),
                        "playing_handicap": _safe_int(
                            payload.get("playing_handicap")
                            or payload.get("playingHandicap")
                        ),
                        "status": payload.get("status"),
                        "created_at": now,
                        "updated_at": now,
                        "format": None,
                        "holes": {},
                    }
                    cards[scorecard_id] = card
                else:
                    card["name"] = str(
                        payload.get("name") or card.get("name") or "Player"
                    )
                    member_id = payload.get("member_id") or payload.get("memberId")
                    if member_id:
                        card["member_id"] = member_id
                    hcp_index = _safe_float(
                        payload.get("hcp_index") or payload.get("hcpIndex")
                    )
                    if hcp_index is not None:
                        card["hcp_index"] = hcp_index
                    course_hcp = _safe_int(
                        payload.get("course_handicap") or payload.get("courseHandicap")
                    )
                    if course_hcp is not None:
                        card["course_handicap"] = course_hcp
                    playing_hcp = _safe_int(
                        payload.get("playing_handicap")
                        or payload.get("playingHandicap")
                    )
                    if playing_hcp is not None:
                        card["playing_handicap"] = playing_hcp
                    status = payload.get("status")
                    if status:
                        card["status"] = status
                    card["updated_at"] = now
                member_id = card.get("member_id")
                if member_id:
                    self._members[(event_id, str(member_id))] = _Member(
                        event_id=event_id,
                        member_id=str(member_id),
                        name=card.get("name"),
                        role="player",
                    )
                results.append(self._scorecard_public_view(card))
            return results

    def upsert_score(
        self, event_id: str, payload: Mapping[str, Any]
    ) -> Tuple[str, Dict[str, Any]]:
        with self._lock:
            cards = self._scorecards.get(event_id)
            if cards is None:
                raise KeyError(event_id)
            scorecard_id_raw = (
                payload.get("scorecard_id")
                or payload.get("scorecardId")
                or payload.get("card_id")
            )
            if not scorecard_id_raw:
                raise KeyError("scorecard_id")
            scorecard_id = str(scorecard_id_raw)
            card = cards.get(scorecard_id)
            if card is None:
                raise KeyError(scorecard_id)
            hole = _to_int(payload.get("hole"))
            if hole is None or hole <= 0:
                raise ValueError("invalid hole")
            revision = _safe_int(payload.get("revision"))
            fingerprint = payload.get("fingerprint")
            if isinstance(fingerprint, str):
                fingerprint = fingerprint.strip() or None
            existing = card["holes"].get(hole)
            incoming_revision = revision
            incoming_fingerprint = fingerprint
            if existing is not None:
                existing_revision = _safe_int(existing.get("revision"))
                existing_fingerprint = existing.get("fingerprint")
                if incoming_fingerprint == existing_fingerprint and (
                    incoming_revision is None or incoming_revision == existing_revision
                ):
                    record = dict(existing)
                    if "updated_at" not in record and existing.get("updated_at"):
                        record["updated_at"] = existing.get("updated_at")
                    return "idempotent", record
                if incoming_revision is None or (
                    existing_revision is not None
                    and incoming_revision <= existing_revision
                ):
                    return "conflict", {
                        "revision": existing_revision,
                        "fingerprint": existing_fingerprint,
                    }
            gross = _to_int(payload.get("gross")) or 0
            net = _safe_int(payload.get("net"))
            stableford = _safe_int(payload.get("stableford"))
            par = _safe_int(payload.get("par"))
            to_par = _safe_int(payload.get("to_par") or payload.get("toPar"))
            strokes_received = _safe_int(
                payload.get("strokes_received") or payload.get("strokesReceived")
            )
            playing_handicap = _safe_int(
                payload.get("playing_handicap") or payload.get("playingHandicap")
            )
            course_handicap = _safe_int(
                payload.get("course_handicap") or payload.get("courseHandicap")
            )
            hcp_index = _safe_float(payload.get("hcp_index") or payload.get("hcpIndex"))
            row_format_raw = payload.get("format")
            row_format = (
                row_format_raw.lower()
                if isinstance(row_format_raw, str)
                and row_format_raw.lower() in VALID_GROSS_NET
                else None
            )
            now = datetime.now(timezone.utc).isoformat()
            if to_par is None and par is not None:
                to_par = gross - par
            if existing is None:
                target_revision = (
                    incoming_revision if incoming_revision is not None else 1
                )
                status_label = "created"
            else:
                target_revision = incoming_revision
                if target_revision is None:
                    raise ValueError("missing revision for score update")
                status_label = "updated"
            record = {
                "hole": hole,
                "gross": gross,
                "net": net,
                "stableford": stableford,
                "par": par,
                "to_par": to_par,
                "strokes_received": strokes_received,
                "playing_handicap": playing_handicap,
                "course_handicap": course_handicap,
                "fingerprint": fingerprint,
                "revision": target_revision,
                "format": row_format,
                "updated_at": now,
            }
            card["holes"][hole] = record
            card["updated_at"] = now
            if hcp_index is not None:
                card["hcp_index"] = hcp_index
            if playing_handicap is not None:
                card["playing_handicap"] = playing_handicap
            if course_handicap is not None:
                card["course_handicap"] = course_handicap
            if row_format is not None:
                card["format"] = row_format
            return status_label, dict(record)

    def get_score_rows(
        self, event_id: str
    ) -> Tuple[List[Mapping[str, Any]], Dict[str, Dict[str, Any]]]:
        with self._lock:
            cards = self._scorecards.get(event_id)
            if not cards:
                return [], {}
            rows: List[Mapping[str, Any]] = []
            meta: Dict[str, Dict[str, Any]] = {}
            for scorecard_id, card in cards.items():
                meta[scorecard_id] = {
                    "name": card.get("name"),
                    "member_id": card.get("member_id"),
                    "hcp_index": card.get("hcp_index"),
                    "course_handicap": card.get("course_handicap"),
                    "playing_handicap": card.get("playing_handicap"),
                    "status": card.get("status"),
                    "updated_at": card.get("updated_at"),
                    "created_at": card.get("created_at"),
                    "format": card.get("format"),
                }
                for hole_no, hole_data in card.get("holes", {}).items():
                    row = dict(hole_data)
                    row["hole"] = hole_no
                    row["scorecard_id"] = scorecard_id
                    rows.append(row)
            return rows, meta

    def _scorecard_public_view(self, card: Mapping[str, Any]) -> Dict[str, Any]:
        hcp_index = card.get("hcp_index")
        return {
            "scorecardId": str(card.get("scorecard_id")),
            "name": str(card.get("name") or "Player"),
            "memberId": card.get("member_id"),
            "hcpIndex": (
                float(hcp_index) if isinstance(hcp_index, (int, float)) else hcp_index
            ),
            "courseHandicap": card.get("course_handicap"),
            "playingHandicap": card.get("playing_handicap"),
            "status": card.get("status"),
            "updatedAt": card.get("updated_at"),
        }

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

    def get_member(self, event_id: str, member_id: str) -> _Member | None:
        with self._lock:
            member = self._members.get((event_id, member_id))
            if member is None:
                return None
            return _Member(
                event_id=member.event_id,
                member_id=member.member_id,
                name=member.name,
                role=member.role,
            )

    def get_board(self, event_id: str) -> List[Mapping[str, Any]]:
        with self._lock:
            board = self._boards.get(event_id)
            if board is None:
                return []
            return [dict(row) for row in board]

    def set_status(self, event_id: str, status: str) -> Dict[str, Any] | None:
        with self._lock:
            if event_id not in self._events:
                return None
            self._event_status[event_id] = status
            event = self._events[event_id]
            event["status"] = status
            return dict(event)

    def regenerate_code(self, event_id: str, new_code: str) -> str | None:
        with self._lock:
            if event_id not in self._events:
                return None
            old_code = self._event_codes.get(event_id)
            if old_code:
                self._codes.pop(old_code, None)
            self._codes[new_code] = event_id
            self._event_codes[event_id] = new_code
            self._events[event_id]["code"] = new_code
            return new_code

    def update_settings(
        self, event_id: str, *, settings: Mapping[str, Any]
    ) -> Dict[str, Any] | None:
        with self._lock:
            if event_id not in self._events:
                return None
            current = self._event_settings.setdefault(
                event_id,
                {"grossNet": DEFAULT_GROSS_NET, "tvFlags": dict(DEFAULT_TV_FLAGS)},
            )
            if "grossNet" in settings:
                current["grossNet"] = _normalize_gross_net(settings.get("grossNet"))
            if "tvFlags" in settings:
                current["tvFlags"] = _normalize_tv_flags(
                    settings.get("tvFlags")
                    if isinstance(settings.get("tvFlags"), Mapping)
                    else None
                )
            stored = {
                "grossNet": _normalize_gross_net(current.get("grossNet")),
                "tvFlags": _normalize_tv_flags(current.get("tvFlags")),
            }
            self._event_settings[event_id] = stored
            self._events[event_id]["settings"] = stored
            return dict(stored)

    def get_settings(self, event_id: str) -> Dict[str, Any]:
        with self._lock:
            return self._clone_settings_locked(event_id)

    def counts(self, event_id: str) -> Dict[str, int]:
        with self._lock:
            return self._counts_locked(event_id)

    def _clone_settings_locked(self, event_id: str) -> Dict[str, Any]:
        settings = self._event_settings.get(event_id)
        if not settings:
            return {
                "grossNet": DEFAULT_GROSS_NET,
                "tvFlags": dict(DEFAULT_TV_FLAGS),
            }
        return {
            "grossNet": _normalize_gross_net(settings.get("grossNet")),
            "tvFlags": _normalize_tv_flags(settings.get("tvFlags")),
        }

    def _counts_locked(self, event_id: str) -> Dict[str, int]:
        participants = self._count_members_locked(event_id, {"player", "admin"})
        spectators = self._count_members_locked(event_id, {"spectator"})
        return {"participants": participants, "spectators": spectators}

    def _count_members_locked(self, event_id: str, roles: set[str]) -> int:
        return sum(
            1
            for (ev_id, _), member in self._members.items()
            if ev_id == event_id and member.role in roles
        )


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


@router.post(
    "/{event_id}/players",
    response_model=RegisterPlayersResponse,
    status_code=status.HTTP_200_OK,
)
def register_players(
    event_id: str, body: RegisterPlayersBody
) -> RegisterPlayersResponse:
    if not body.players:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="no players provided"
        )
    try:
        stored = _REPOSITORY.register_scorecards(
            event_id,
            [player.model_dump(by_alias=True) for player in body.players],
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
        ) from None
    response_players = [EventPlayerState(**item) for item in stored]
    return RegisterPlayersResponse(players=response_players)


@router.post(
    "/{event_id}/score",
    response_model=ScoreWriteResponse,
    status_code=status.HTTP_200_OK,
)
def submit_score(event_id: str, body: ScoreWriteBody) -> ScoreWriteResponse:
    payload = body.model_dump(by_alias=True)
    start = time.perf_counter()
    try:
        status_label, record = _REPOSITORY.upsert_score(event_id, payload)
    except KeyError:
        record_score_write(
            event_id,
            (time.perf_counter() - start) * 1000.0,
            status="missing",
            fingerprint=body.fingerprint,
            revision=body.revision,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="scorecard not found"
        ) from None
    except ValueError as exc:
        record_score_write(
            event_id,
            (time.perf_counter() - start) * 1000.0,
            status="invalid",
            fingerprint=body.fingerprint,
            revision=body.revision,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    duration_ms = (time.perf_counter() - start) * 1000.0
    if status_label == "conflict":
        existing_revision = _safe_int(record.get("revision"))
        record_score_conflict(
            event_id,
            revision=existing_revision,
            fingerprint=body.fingerprint,
        )
        record_score_conflict_stale_or_duplicate(
            event_id,
            incoming_revision=body.revision,
            existing_revision=existing_revision,
            fingerprint=body.fingerprint,
        )
        record_score_write(
            event_id,
            duration_ms,
            status="conflict",
            fingerprint=body.fingerprint,
            revision=body.revision,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "reason": "STALE_OR_DUPLICATE",
                "currentRevision": existing_revision,
            },
        )

    revision_value = _safe_int(record.get("revision"))
    updated_at = record.get("updated_at") or datetime.now(timezone.utc).isoformat()
    if status_label == "idempotent":
        record_score_idempotent(
            event_id,
            fingerprint=body.fingerprint,
            revision=revision_value,
        )
        record_score_write(
            event_id,
            duration_ms,
            status="idempotent",
            fingerprint=body.fingerprint,
            revision=body.revision,
        )
        return ScoreWriteResponse(
            status="ok",
            revision=revision_value,
            updated_at=updated_at,
            idempotent=True,
        )

    record_score_write(
        event_id,
        duration_ms,
        status="ok",
        fingerprint=body.fingerprint,
        revision=body.revision,
    )
    response_payload = ScoreWriteResponse(
        status="ok",
        revision=revision_value,
        updated_at=updated_at,
    )
    if status_label == "created":
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=response_payload.model_dump(by_alias=True, exclude_none=True),
        )
    return response_payload


@router.get("/{event_id}/board", response_model=BoardResponse)
def get_board(event_id: str, format: str | None = Query(default=None)) -> BoardResponse:
    event = _REPOSITORY.get_event(event_id)
    settings = event.get("settings") if event else {}
    configured_mode = (
        _normalize_gross_net(settings.get("grossNet"))
        if settings
        else DEFAULT_GROSS_NET
    )
    override_mode = _normalize_gross_net(format) if format else None
    mode = override_mode or configured_mode
    tv_flags = _normalize_tv_flags(settings.get("tvFlags") if settings else None)

    start = time.perf_counter()
    score_rows, score_meta = _REPOSITORY.get_score_rows(event_id)
    if score_rows or score_meta:
        players, updated_at = _aggregate_scorecards(score_rows, score_meta, mode=mode)
        rows_count = len(players)
    else:
        legacy_rows = _REPOSITORY.get_board(event_id)
        if not legacy_rows:
            record_board_resync(event_id, reason="empty", attempt=1)
        players, updated_at = build_board(legacy_rows, mode=mode)
        rows_count = len(players)
    duration_ms = (time.perf_counter() - start) * 1000.0
    record_board_build(event_id, duration_ms, mode=mode, rows=rows_count)

    counts = (
        {
            "participants": int(event.get("participants", 0)),
            "spectators": int(event.get("spectators", 0)),
        }
        if event
        else _REPOSITORY.counts(event_id)
    )
    qr_svg_value: str | None = None
    if tv_flags.get("showQrOverlay") and event:
        code = str(event.get("code") or "").upper()
        if code:
            join_url = f"{_web_base_url()}/join/{code}"
            qr_svg_value = qr_svg(join_url)
    return BoardResponse(
        players=players,
        updatedAt=updated_at,
        grossNet=mode,
        tvFlags=TvFlagsModel(**tv_flags),
        participants=counts.get("participants", 0),
        spectators=counts.get("spectators", 0),
        qrSvg=qr_svg_value,
    )


@router.post(
    "/clips/{clip_id}/commentary",
    response_model=CommentaryOut,
    dependencies=[Depends(require_admin)],
)
def create_clip_commentary(clip_id: UUID) -> CommentaryOut:
    result = commentary.generate_commentary(str(clip_id))
    return CommentaryOut(
        title=result.title, summary=result.summary, ttsUrl=result.tts_url
    )


@router.get("/{event_id}/host", response_model=HostStateResponse)
def get_host_state(
    event_id: str,
    member_id: str | None = Depends(require_admin),
) -> HostStateResponse:
    return _build_host_state(event_id)


@router.post("/{event_id}/start", response_model=HostStateResponse)
def start_event(
    event_id: str,
    member_id: str | None = Depends(require_admin),
) -> HostStateResponse:
    updated = _REPOSITORY.set_status(event_id, "live")
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
        )
    record_host_action(event_id, "start", member_id=member_id)
    return _build_host_state(event_id)


@router.post("/{event_id}/pause", response_model=HostStateResponse)
def pause_event(
    event_id: str,
    member_id: str | None = Depends(require_admin),
) -> HostStateResponse:
    updated = _REPOSITORY.set_status(event_id, "paused")
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
        )
    record_host_action(event_id, "pause", member_id=member_id)
    return _build_host_state(event_id)


@router.post("/{event_id}/close", response_model=HostStateResponse)
def close_event(
    event_id: str,
    member_id: str | None = Depends(require_admin),
) -> HostStateResponse:
    updated = _REPOSITORY.set_status(event_id, "closed")
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
        )
    record_host_action(event_id, "close", member_id=member_id)
    return _build_host_state(event_id)


@router.post("/{event_id}/code/regenerate", response_model=HostStateResponse)
def regenerate_code(
    event_id: str,
    member_id: str | None = Depends(require_admin),
) -> HostStateResponse:
    def acquire_unique_code(attempts: int, generator: Callable[[], str]) -> str | None:
        for _ in range(attempts):
            candidate = generator()
            existing = _REPOSITORY.resolve_event_by_code(candidate)
            if existing is None:
                return candidate
        return None

    candidate = acquire_unique_code(5, generate_code)

    if candidate is None:

        def fallback() -> str:
            body = _random_indexes(6)
            checksum = _compute_checksum(body)
            indexes = [*body, checksum]
            return "".join(ALPHABET[i] for i in indexes)

        candidate = acquire_unique_code(10, fallback)

    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="unable to allocate join code",
        )
    if _REPOSITORY.regenerate_code(event_id, candidate) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
        )
    record_host_action(event_id, "code.regenerate", member_id=member_id)
    state = _build_host_state(event_id)
    if state.qrSvg is None:
        state = state.model_copy(update={"qrSvg": qr_svg_placeholder()})
    return state


@router.patch("/{event_id}/settings", response_model=HostStateResponse)
def update_settings(
    event_id: str,
    body: UpdateSettingsBody = Body(default_factory=UpdateSettingsBody),
    member_id: str | None = Depends(require_admin),
) -> HostStateResponse:
    payload: Dict[str, Any] = {}
    if body.grossNet is not None:
        payload["grossNet"] = body.grossNet
    if body.tvFlags is not None:
        payload["tvFlags"] = body.tvFlags.model_dump(by_alias=True)
    if payload:
        updated = _REPOSITORY.update_settings(event_id, settings=payload)
        if updated is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
            )
    else:
        if _REPOSITORY.get_event(event_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
            )
    record_host_action(event_id, "settings.update", member_id=member_id)
    return _build_host_state(event_id)


def _build_host_state(event_id: str) -> HostStateResponse:
    event = _REPOSITORY.get_event(event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="event not found"
        )
    code = str(event.get("code") or "").upper()
    base_url = _web_base_url()
    join_url = f"{base_url}/join/{code}" if code else f"{base_url}/events/{event_id}"
    settings = event.get("settings") or {}
    gross_net = _normalize_gross_net(settings.get("grossNet"))
    tv_flags = _normalize_tv_flags(settings.get("tvFlags"))
    counts = _REPOSITORY.counts(event_id)
    svg = qr_svg(join_url) if code else None
    return HostStateResponse(
        id=event_id,
        name=str(event.get("name") or "Event"),
        status=str(event.get("status") or "pending"),
        code=code,
        joinUrl=join_url,
        grossNet=gross_net,
        tvFlags=TvFlagsModel(**tv_flags),
        participants=counts.get("participants", 0),
        spectators=counts.get("spectators", 0),
        qrSvg=svg,
    )


__all__ = [
    "router",
    "join_router",
    "build_board",
    "generate_code",
    "validate_code",
    "require_admin",
]


def _compute_net_simple(gross: float, hcp_index: float | None, holes: int) -> int:
    if holes <= 0:
        return int(round(gross))
    if hcp_index is None:
        return int(round(gross))
    adjustment = round(hcp_index * (holes / 18.0))
    return int(max(0, round(gross - adjustment)))


def _safe_int(value: Any) -> int | None:
    parsed = _to_int(value)
    return parsed if parsed is not None else None


def _safe_float(value: Any) -> float | None:
    parsed = _to_float(value)
    return parsed if parsed is not None else None
