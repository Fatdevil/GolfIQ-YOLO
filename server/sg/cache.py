"""Small LRU cache for per-run strokes gained results."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock
from time import time
from typing import Optional

from .schemas import RunSG


@dataclass(slots=True)
class _CacheEntry:
    fingerprint: str
    value: RunSG
    expires_at: float


class RunSGCache:
    def __init__(self, maxsize: int = 256, ttl_seconds: float = 600.0) -> None:
        self._maxsize = max(1, int(maxsize))
        self._ttl = max(1.0, float(ttl_seconds))
        self._data: "OrderedDict[str, _CacheEntry]" = OrderedDict()
        self._lock = Lock()
        self.hit_count = 0
        self.miss_count = 0

    def _purge_if_expired(self, run_id: str, entry: _CacheEntry) -> bool:
        if entry.expires_at < time():
            self._data.pop(run_id, None)
            return True
        return False

    def get(self, run_id: str, *, fingerprint: Optional[str] = None) -> Optional[RunSG]:
        with self._lock:
            entry = self._data.get(run_id)
            if entry is None or self._purge_if_expired(run_id, entry):
                return None
            if fingerprint is not None and entry.fingerprint != fingerprint:
                return None
            self._data.move_to_end(run_id)
            self.hit_count += 1
            return entry.value

    def put(self, run_id: str, value: RunSG, *, fingerprint: str) -> None:
        with self._lock:
            expires_at = time() + self._ttl
            self._data[run_id] = _CacheEntry(
                fingerprint=fingerprint, value=value, expires_at=expires_at
            )
            self._data.move_to_end(run_id)
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)

    def record_miss(self) -> None:
        with self._lock:
            self.miss_count += 1

    def stats(self) -> tuple[int, int]:
        with self._lock:
            return self.hit_count, self.miss_count

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
            self.hit_count = 0
            self.miss_count = 0


__all__ = ["RunSGCache"]
