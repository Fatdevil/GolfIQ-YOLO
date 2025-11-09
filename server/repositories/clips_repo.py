from __future__ import annotations

import json
import math
import os
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Protocol

import httpx

__all__ = ["ClipsRepository", "clips_repo", "InMemoryClipsRepository"]

RATE_LIMIT_SECONDS = int(os.getenv("CLIPS_REACTION_RATE_LIMIT_SECONDS", "10") or "10")
RECENT_WINDOW_SECONDS = int(os.getenv("CLIPS_REACTION_RECENT_WINDOW", "60") or "60")
ALPHA = float(os.getenv("CLIPS_WEIGHT_ALPHA", "1.5") or "1.5")
BETA = float(os.getenv("CLIPS_WEIGHT_BETA", "0.5") or "0.5")
DEFAULT_VISIBILITY = os.getenv("CLIPS_VISIBILITY_DEFAULT", "event")


class ClipsRepository(Protocol):
    def create_placeholder(
        self,
        *,
        event_id: uuid.UUID,
        player_id: uuid.UUID,
        hole: int | None,
        fingerprint: str,
        visibility: str | None = None,
    ) -> uuid.UUID: ...

    def mark_processing(
        self,
        clip_id: uuid.UUID,
        src_uri: str,
        *,
        actor: str | None = None,
    ) -> bool: ...

    def mark_ready(
        self,
        clip_id: uuid.UUID,
        *,
        hls_url: str,
        mp4_url: str | None,
        thumb_url: str | None,
        duration_ms: int | None,
    ) -> bool: ...

    def mark_failed(self, clip_id: uuid.UUID, *, error: str | None = None) -> bool: ...

    def list_ready(
        self,
        event_id: uuid.UUID,
        *,
        after: datetime | None = None,
        limit: int = 20,
        visibility: str | None = None,
    ) -> List[Mapping[str, Any]]: ...

    def fetch(self, clip_id: uuid.UUID) -> Mapping[str, Any] | None: ...

    def add_reaction(self, clip_id: uuid.UUID, member_id: str, emoji: str) -> bool: ...

    def to_public(self, record: Mapping[str, Any]) -> Dict[str, Any]: ...


@dataclass
class _ReactionState:
    counts: Dict[str, int]
    users: Dict[str, Dict[str, str]]
    recent: List[Dict[str, str]]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_uuid(value: uuid.UUID | str) -> uuid.UUID:
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


def _parse_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        try:
            if value.endswith("Z"):
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _serialize_ts(dt_value: datetime) -> str:
    return dt_value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _sort_key(record: Mapping[str, Any]) -> datetime:
    parsed = _parse_dt(record.get("created_at"))
    if parsed:
        return parsed
    return datetime.min.replace(tzinfo=timezone.utc)


def _reaction_state(payload: Any | None) -> _ReactionState:
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = None
    counts: Dict[str, int] = {}
    users: Dict[str, Dict[str, str]] = {}
    recent: List[Dict[str, str]] = []
    if isinstance(payload, Mapping):
        stored_counts = payload.get("counts")
        if isinstance(stored_counts, Mapping):
            counts = {
                str(k): int(v)
                for k, v in stored_counts.items()
                if isinstance(v, (int, float))
            }
        stored_users = payload.get("users")
        if isinstance(stored_users, Mapping):
            users = {
                str(k): {"emoji": str(v.get("emoji", "")), "ts": str(v.get("ts", ""))}
                for k, v in stored_users.items()
                if isinstance(v, Mapping)
            }
        stored_recent = payload.get("recent")
        if isinstance(stored_recent, Iterable):
            for entry in stored_recent:
                if isinstance(entry, Mapping):
                    emoji = str(entry.get("emoji", ""))
                    ts = str(entry.get("ts", ""))
                    recent.append({"emoji": emoji, "ts": ts})
    return _ReactionState(counts=counts, users=users, recent=recent)


def _register_reaction(
    state: _ReactionState,
    member_id: str,
    emoji: str,
    *,
    now: datetime,
) -> tuple[bool, _ReactionState, int]:
    member_id = str(member_id)
    emoji = emoji.strip()
    if not emoji:
        return False, state, 0

    last_entry = state.users.get(member_id)
    if last_entry:
        last_ts = _parse_dt(last_entry.get("ts"))
        if last_ts and (now - last_ts).total_seconds() < RATE_LIMIT_SECONDS:
            return False, state, _recent_count(state, now)

    counts = dict(state.counts)
    counts[emoji] = counts.get(emoji, 0) + 1
    users = dict(state.users)
    users[member_id] = {"emoji": emoji, "ts": _serialize_ts(now)}
    recent = list(state.recent)
    recent.append({"emoji": emoji, "ts": _serialize_ts(now)})
    trimmed_recent = []
    for entry in recent:
        ts = _parse_dt(entry.get("ts"))
        if ts and (now - ts).total_seconds() <= RECENT_WINDOW_SECONDS:
            trimmed_recent.append(entry)
    new_state = _ReactionState(counts=counts, users=users, recent=trimmed_recent)
    return True, new_state, len(trimmed_recent)


def _recent_count(state: _ReactionState, now: datetime) -> int:
    count = 0
    for entry in state.recent:
        ts = _parse_dt(entry.get("ts"))
        if ts and (now - ts).total_seconds() <= RECENT_WINDOW_SECONDS:
            count += 1
    return count


def _total_count(state: _ReactionState) -> int:
    return sum(max(0, int(v)) for v in state.counts.values())


def _compute_weight(
    *, recent: int, total: int, created_at: datetime | None, now: datetime
) -> float:
    recency_factor = 0.0
    if created_at:
        age_seconds = max(0.0, (now - created_at).total_seconds())
        recency_factor = math.exp(-age_seconds / max(1.0, 3600.0))
    return recent + ALPHA * math.log1p(total) + BETA * recency_factor


def _public_from_record(
    record: Mapping[str, Any], *, now: datetime | None = None
) -> Dict[str, Any]:
    now = now or _now()
    state = _reaction_state(record.get("reactions"))
    created_at = _parse_dt(record.get("created_at"))
    recent = _recent_count(state, now)
    total = _total_count(state)
    weight = _compute_weight(recent=recent, total=total, created_at=created_at, now=now)
    round_id = record.get("round_id")
    payload: Dict[str, Any] = {
        "id": str(record.get("id")),
        "eventId": str(record.get("event_id")),
        "playerId": str(record.get("player_id")),
        "roundId": str(round_id) if round_id else None,
        "hole": record.get("hole"),
        "status": record.get("status"),
        "srcUri": record.get("src_uri"),
        "hlsUrl": record.get("hls_url"),
        "mp4Url": record.get("mp4_url"),
        "thumbUrl": record.get("thumb_url"),
        "durationMs": record.get("duration_ms"),
        "fingerprint": record.get("fingerprint"),
        "visibility": record.get("visibility", DEFAULT_VISIBILITY),
        "createdAt": _serialize_ts(created_at) if created_at else None,
        "reactions": {
            "counts": state.counts,
            "recentCount": recent,
            "total": total,
        },
        "weight": weight,
    }
    return payload


class SupabaseClipsRepository:
    def __init__(
        self, *, base_url: str, service_key: str, visibility: str = DEFAULT_VISIBILITY
    ):
        base_url = base_url.rstrip("/")
        if not base_url.endswith("/rest/v1"):
            base_url = f"{base_url}/rest/v1"
        self._base_url = base_url
        self._visibility = visibility
        self._client = httpx.Client(
            base_url=base_url,
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )
        self._lock = threading.Lock()

    @classmethod
    def from_env(cls) -> "SupabaseClipsRepository":
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        if not url or not key:
            raise RuntimeError("Supabase credentials not configured")
        return cls(base_url=url, service_key=key, visibility=DEFAULT_VISIBILITY)

    def close(self) -> None:
        with self._lock:
            self._client.close()

    def create_placeholder(
        self,
        *,
        event_id: uuid.UUID,
        player_id: uuid.UUID,
        hole: int | None,
        fingerprint: str,
        visibility: str | None = None,
    ) -> uuid.UUID:
        payload = {
            "event_id": str(event_id),
            "player_id": str(player_id),
            "hole": hole,
            "fingerprint": fingerprint,
            "status": "queued",
            "visibility": visibility or self._visibility,
        }
        response = self._client.post(
            "/shot_clips",
            json=payload,
            headers={"Prefer": "return=representation"},
        )
        response.raise_for_status()
        data = response.json()
        if not data:
            raise RuntimeError("failed to create clip placeholder")
        return _ensure_uuid(data[0]["id"])

    def mark_processing(
        self,
        clip_id: uuid.UUID,
        src_uri: str,
        *,
        actor: str | None = None,
    ) -> bool:
        update = {
            "status": "processing",
            "src_uri": src_uri,
        }
        if actor:
            update["processed_by"] = actor
        response = self._client.patch(
            "/shot_clips",
            params={"id": f"eq.{clip_id}"},
            json=update,
            headers={"Prefer": "return=representation"},
        )
        if response.status_code == 404:
            return False
        response.raise_for_status()
        return bool(response.json())

    def mark_ready(
        self,
        clip_id: uuid.UUID,
        *,
        hls_url: str,
        mp4_url: str | None,
        thumb_url: str | None,
        duration_ms: int | None,
    ) -> bool:
        update = {
            "status": "ready",
            "hls_url": hls_url,
            "mp4_url": mp4_url,
            "thumb_url": thumb_url,
            "duration_ms": duration_ms,
        }
        response = self._client.patch(
            "/shot_clips",
            params={"id": f"eq.{clip_id}"},
            json=update,
            headers={"Prefer": "return=representation"},
        )
        if response.status_code == 404:
            return False
        response.raise_for_status()
        return bool(response.json())

    def mark_failed(self, clip_id: uuid.UUID, *, error: str | None = None) -> bool:
        update: Dict[str, Any] = {
            "status": "failed",
        }
        if error:
            update["error"] = error
        response = self._client.patch(
            "/shot_clips",
            params={"id": f"eq.{clip_id}"},
            json=update,
            headers={"Prefer": "return=minimal"},
        )
        if response.status_code == 404:
            return False
        response.raise_for_status()
        return True

    def list_ready(
        self,
        event_id: uuid.UUID,
        *,
        after: datetime | None = None,
        limit: int = 20,
        visibility: str | None = None,
    ) -> List[Mapping[str, Any]]:
        params: Dict[str, Any] = {
            "event_id": f"eq.{event_id}",
            "status": "eq.ready",
            "order": "created_at.desc",
            "limit": limit,
        }
        if after:
            params["created_at"] = f"gt.{_serialize_ts(after)}"
        if visibility:
            params["visibility"] = f"eq.{visibility}"
        response = self._client.get("/shot_clips", params=params)
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list):
            return data
        return []

    def fetch(self, clip_id: uuid.UUID) -> Mapping[str, Any] | None:
        response = self._client.get(
            "/shot_clips",
            params={"id": f"eq.{clip_id}", "limit": 1},
        )
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list) and data:
            return data[0]
        return None

    def add_reaction(self, clip_id: uuid.UUID, member_id: str, emoji: str) -> bool:
        record = self.fetch(clip_id)
        if not record:
            return False
        now = _now()
        state = _reaction_state(record.get("reactions"))
        allowed, new_state, _ = _register_reaction(state, member_id, emoji, now=now)
        if not allowed:
            return False
        payload = {
            "reactions": {
                "counts": new_state.counts,
                "users": new_state.users,
                "recent": new_state.recent,
            }
        }
        response = self._client.patch(
            "/shot_clips",
            params={"id": f"eq.{clip_id}"},
            json=payload,
            headers={"Prefer": "return=minimal"},
        )
        response.raise_for_status()
        return True

    def to_public(self, record: Mapping[str, Any]) -> Dict[str, Any]:
        return _public_from_record(record)


class InMemoryClipsRepository:
    def __init__(self) -> None:
        self._records: Dict[uuid.UUID, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create_placeholder(
        self,
        *,
        event_id: uuid.UUID,
        player_id: uuid.UUID,
        hole: int | None,
        fingerprint: str,
        visibility: str | None = None,
    ) -> uuid.UUID:
        clip_id = uuid.uuid4()
        now = _now()
        with self._lock:
            self._records[clip_id] = {
                "id": clip_id,
                "event_id": event_id,
                "player_id": player_id,
                "hole": hole,
                "fingerprint": fingerprint,
                "status": "queued",
                "visibility": visibility or DEFAULT_VISIBILITY,
                "reactions": {
                    "counts": {},
                    "users": {},
                    "recent": [],
                },
                "created_at": _serialize_ts(now),
            }
        return clip_id

    def mark_processing(
        self,
        clip_id: uuid.UUID,
        src_uri: str,
        *,
        actor: str | None = None,
    ) -> bool:
        with self._lock:
            record = self._records.get(clip_id)
            if not record:
                return False
            record["status"] = "processing"
            record["src_uri"] = src_uri
            if actor:
                record["processed_by"] = actor
            return True

    def mark_ready(
        self,
        clip_id: uuid.UUID,
        *,
        hls_url: str,
        mp4_url: str | None,
        thumb_url: str | None,
        duration_ms: int | None,
    ) -> bool:
        with self._lock:
            record = self._records.get(clip_id)
            if not record:
                return False
            record["status"] = "ready"
            record["hls_url"] = hls_url
            record["mp4_url"] = mp4_url
            record["thumb_url"] = thumb_url
            record["duration_ms"] = duration_ms
            return True

    def mark_failed(self, clip_id: uuid.UUID, *, error: str | None = None) -> bool:
        with self._lock:
            record = self._records.get(clip_id)
            if not record:
                return False
            record["status"] = "failed"
            if error:
                record["error"] = error
            return True

    def list_ready(
        self,
        event_id: uuid.UUID,
        *,
        after: datetime | None = None,
        limit: int = 20,
        visibility: str | None = None,
    ) -> List[Mapping[str, Any]]:
        with self._lock:
            rows = [
                record
                for record in self._records.values()
                if str(record.get("event_id")) == str(event_id)
                and record.get("status") == "ready"
                and (visibility is None or record.get("visibility") == visibility)
            ]
            rows.sort(key=_sort_key, reverse=True)
            if after:
                rows = [
                    r
                    for r in rows
                    if (ts := _parse_dt(r.get("created_at"))) is None or ts > after
                ]
            return rows[: max(1, limit)]

    def fetch(self, clip_id: uuid.UUID) -> Mapping[str, Any] | None:
        with self._lock:
            return self._records.get(clip_id)

    def add_reaction(self, clip_id: uuid.UUID, member_id: str, emoji: str) -> bool:
        with self._lock:
            record = self._records.get(clip_id)
            if not record:
                return False
            state = _reaction_state(record.get("reactions"))
            allowed, new_state, _ = _register_reaction(
                state, member_id, emoji, now=_now()
            )
            if not allowed:
                return False
            record["reactions"] = {
                "counts": new_state.counts,
                "users": new_state.users,
                "recent": new_state.recent,
            }
            return True

    def to_public(self, record: Mapping[str, Any]) -> Dict[str, Any]:
        return _public_from_record(record)


class _ClipsRepoFacade:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._repo: ClipsRepository = self._build_default()

    def _build_default(self) -> ClipsRepository:
        try:
            return SupabaseClipsRepository.from_env()
        except Exception:
            return InMemoryClipsRepository()

    def set_repository(self, repo: ClipsRepository) -> None:
        with self._lock:
            self._repo = repo

    def reset(self) -> None:
        with self._lock:
            self._repo = self._build_default()

    def __getattr__(self, name: str):
        repo = self._repo
        return getattr(repo, name)


clips_repo = _ClipsRepoFacade()
