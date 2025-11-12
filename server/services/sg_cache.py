from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from time import time
from typing import Optional


@dataclass
class CacheEntry:
    fp: str
    payload: dict
    ts: float


class SGCache:
    def __init__(self, cap: int = 256) -> None:
        self.cap = cap
        self._store: "OrderedDict[str, CacheEntry]" = OrderedDict()

    def get(self, run_id: str, fp: str) -> Optional[dict]:
        entry = self._store.get(run_id)
        if not entry or entry.fp != fp:
            return None
        self._store.move_to_end(run_id)
        return entry.payload

    def set(self, run_id: str, fp: str, payload: dict) -> None:
        self._store[run_id] = CacheEntry(fp=fp, payload=payload, ts=time())
        self._store.move_to_end(run_id)
        while len(self._store) > self.cap:
            self._store.popitem(last=False)


CACHE = SGCache()


__all__ = ["CACHE", "CacheEntry", "SGCache"]
