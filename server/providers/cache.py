from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Dict, Optional


def _default_cache_dir() -> Path:
    override = os.getenv("GOLFIQ_PROVIDER_CACHE_DIR")
    if override:
        return Path(override)
    return Path.home() / ".golfiq" / "providers"


@dataclass
class CacheEntry:
    value: Any
    etag: str
    expires_at: float

    @property
    def ttl_seconds(self) -> int:
        remaining = int(self.expires_at - time.time())
        return max(0, remaining)

    def is_expired(self) -> bool:
        return time.time() >= self.expires_at


class ProviderCache:
    def __init__(self, name: str, default_ttl: int) -> None:
        self._name = name
        self._default_ttl = default_ttl
        self._lock = threading.Lock()
        self._memory: Dict[str, CacheEntry] = {}
        self._path = _default_cache_dir() / f"{name}.json"
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._load_from_disk()

    def _load_from_disk(self) -> None:
        if not self._path.exists():
            return
        try:
            payload = json.loads(self._path.read_text())
        except (json.JSONDecodeError, OSError):
            return
        entries = payload.get("entries", {})
        now = time.time()
        for key, raw in entries.items():
            expires_at = float(raw.get("expires_at", 0))
            if expires_at <= now:
                continue
            value = raw.get("value")
            etag = raw.get("etag")
            if etag is None:
                continue
            self._memory[key] = CacheEntry(
                value=value, etag=etag, expires_at=expires_at
            )

    def _flush_to_disk(self) -> None:
        serializable = {
            "entries": {
                key: {
                    "value": entry.value,
                    "etag": entry.etag,
                    "expires_at": entry.expires_at,
                }
                for key, entry in self._memory.items()
                if not entry.is_expired()
            }
        }
        tmp_dir = self._path.parent
        tmp_dir.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile("w", dir=tmp_dir, delete=False) as tmp:
            json.dump(serializable, tmp)
            tmp.flush()
            os.fsync(tmp.fileno())
            temp_name = tmp.name
        os.replace(temp_name, self._path)

    def get(self, key: str) -> Optional[CacheEntry]:
        with self._lock:
            entry = self._memory.get(key)
            if not entry:
                return None
            if entry.is_expired():
                del self._memory[key]
                self._flush_to_disk()
                return None
            return entry

    def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        etag: Optional[str] = None,
    ) -> CacheEntry:
        ttl = ttl or self._default_ttl
        expires_at = time.time() + ttl
        etag_value = etag or _hash_value(value)
        entry = CacheEntry(value=value, etag=etag_value, expires_at=expires_at)
        with self._lock:
            self._memory[key] = entry
            self._flush_to_disk()
        return entry

    def touch(self, key: str, ttl: Optional[int] = None) -> Optional[CacheEntry]:
        ttl = ttl or self._default_ttl
        with self._lock:
            entry = self._memory.get(key)
            if not entry:
                return None
            if entry.is_expired():
                del self._memory[key]
                self._flush_to_disk()
                return None
            entry.expires_at = time.time() + ttl
            self._flush_to_disk()
            return entry


def _hash_value(value: Any) -> str:
    import hashlib

    serialized = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(serialized).hexdigest()
