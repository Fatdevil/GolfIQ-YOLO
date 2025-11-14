from __future__ import annotations

from threading import Lock
from typing import Callable, Dict, Set

_SUBSCRIBERS: Dict[str, Set[Callable[[dict], None]]] = {}
_LOCK = Lock()


def subscribe(trip_id: str, cb: Callable[[dict], None]) -> None:
    with _LOCK:
        _SUBSCRIBERS.setdefault(trip_id, set()).add(cb)


def unsubscribe(trip_id: str, cb: Callable[[dict], None]) -> None:
    with _LOCK:
        if trip_id in _SUBSCRIBERS:
            _SUBSCRIBERS[trip_id].discard(cb)
            if not _SUBSCRIBERS[trip_id]:
                del _SUBSCRIBERS[trip_id]


def publish(trip_id: str, data: dict) -> None:
    with _LOCK:
        callbacks = list(_SUBSCRIBERS.get(trip_id, ()))
    for cb in callbacks:
        try:
            cb(data)
        except Exception:
            # Subscribers should not break the publish loop; swallow errors.
            continue
