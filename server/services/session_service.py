from __future__ import annotations

"""In-memory store for shot sessions used by the coach dashboard."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Dict, Iterable, List, Optional
from uuid import uuid4


@dataclass
class ShotHit:
    """Represents a single shot in a session."""

    on_target: bool = False


@dataclass
class ShotSession:
    """Lightweight model for a player's shot session."""

    session_id: str
    user_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    hits: List[ShotHit] = field(default_factory=list)


_SESSIONS: Dict[str, ShotSession] = {}
_LOCK = Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def start_session(
    user_id: str, *, session_id: Optional[str] = None, started_at: Optional[datetime] = None
) -> ShotSession:
    """Create and register a new session for a user."""

    sid = session_id or str(uuid4())
    session = ShotSession(
        session_id=sid, user_id=user_id, started_at=started_at or _now()
    )
    with _LOCK:
        _SESSIONS[sid] = session
    return session


def record_hit(session_id: str, *, on_target: bool = False) -> ShotSession:
    """Append a hit to an existing session."""

    with _LOCK:
        session = _SESSIONS.get(session_id)
        if not session:
            raise KeyError(f"session {session_id} not found")
        session.hits.append(ShotHit(on_target=on_target))
        session.ended_at = _now()
        return session


def get_session(session_id: str) -> Optional[ShotSession]:
    with _LOCK:
        return _SESSIONS.get(session_id)


def summarize_session(session: ShotSession) -> dict:
    total_shots = len(session.hits)
    on_target_shots = sum(1 for hit in session.hits if hit.on_target)
    on_target_percent = (on_target_shots / total_shots * 100.0) if total_shots else 0.0

    return {
        "session_id": session.session_id,
        "user_id": session.user_id,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "total_shots": total_shots,
        "on_target_shots": on_target_shots,
        "on_target_percent": on_target_percent,
    }


def list_sessions(user_id: str) -> List[dict]:
    """Return summaries for all sessions belonging to a user, latest first."""

    with _LOCK:
        sessions: Iterable[ShotSession] = _SESSIONS.values()
        filtered = [s for s in sessions if s.user_id == user_id]
        ordered = sorted(filtered, key=lambda s: s.started_at, reverse=True)
        return [summarize_session(s) for s in ordered]


def get_session_summary(session_id: str) -> Optional[dict]:
    with _LOCK:
        session = _SESSIONS.get(session_id)
        return summarize_session(session) if session else None


def reset_sessions() -> None:
    with _LOCK:
        _SESSIONS.clear()
