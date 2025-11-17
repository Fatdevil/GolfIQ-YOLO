from __future__ import annotations

from threading import Lock
from typing import Dict, List

from .history_models import QuickRoundSnapshot, RangeSessionSnapshot, UserHistory

_STORE: Dict[str, UserHistory] = {}
_LOCK = Lock()


def _get_or_create(user_id: str) -> UserHistory:
    if user_id not in _STORE:
        _STORE[user_id] = UserHistory(user_id=user_id)
    return _STORE[user_id]


def list_quickrounds(user_id: str) -> List[QuickRoundSnapshot]:
    with _LOCK:
        hist = _get_or_create(user_id)
        return list(hist.quickrounds)


def add_quickrounds(user_id: str, items: List[QuickRoundSnapshot]) -> UserHistory:
    with _LOCK:
        hist = _get_or_create(user_id)
        existing_ids = {qr.id for qr in hist.quickrounds}
        for qr in items:
            if qr.id not in existing_ids:
                hist.quickrounds.append(qr)
        return hist


def list_range_sessions(user_id: str) -> List[RangeSessionSnapshot]:
    with _LOCK:
        hist = _get_or_create(user_id)
        return list(hist.range_sessions)


def add_range_sessions(user_id: str, items: List[RangeSessionSnapshot]) -> UserHistory:
    with _LOCK:
        hist = _get_or_create(user_id)
        existing_ids = {rs.id for rs in hist.range_sessions}
        for rs in items:
            if rs.id not in existing_ids:
                hist.range_sessions.append(rs)
        return hist


def reset_history_store() -> None:
    with _LOCK:
        _STORE.clear()
