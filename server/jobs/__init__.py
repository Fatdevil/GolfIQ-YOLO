"""Simple job dispatch helpers for background workers."""

from __future__ import annotations

import threading
from typing import Any, Callable, Dict, List, Tuple

__all__ = ["enqueue", "set_enqueue_handler", "get_buffered_jobs", "clear_buffer"]

_Handler = Callable[[str, Dict[str, Any]], None]

_handler: _Handler | None = None
_buffer: List[Tuple[str, Dict[str, Any]]] = []
_lock = threading.Lock()


def set_enqueue_handler(handler: _Handler | None) -> None:
    global _handler
    with _lock:
        _handler = handler


def enqueue(name: str, payload: Dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        raise TypeError("job payload must be a dict")
    handler: _Handler | None
    with _lock:
        handler = _handler
        if handler is None:
            _buffer.append((name, dict(payload)))
            return
    handler(name, dict(payload))


def get_buffered_jobs() -> List[Tuple[str, Dict[str, Any]]]:
    with _lock:
        return [(name, dict(payload)) for name, payload in _buffer]


def clear_buffer() -> None:
    with _lock:
        _buffer.clear()
