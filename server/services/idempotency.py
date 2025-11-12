"""Simple in-memory idempotency helpers.

These helpers provide a lightweight mechanism for storing the result of an
idempotent request for a limited window of time. They are intentionally
in-memory only – the persistence layer can be replaced in the future without
touching the call sites.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import time
from typing import Any, Dict, Mapping, MutableMapping

from fastapi import Request

__all__ = [
    "key_from_header",
    "remember",
    "recall",
    "stable_payload",
    "fingerprint",
]


@dataclass(slots=True)
class _MemoEntry:
    expires_at: float
    payload: Dict[str, Any]


_MEMO: MutableMapping[str, _MemoEntry] = {}


def key_from_header(request: Request) -> str | None:
    """Extract the ``Idempotency-Key`` header if present."""

    header = request.headers.get("Idempotency-Key")
    if not header:
        return None
    key = header.strip()
    return key or None


def remember(key: str, value: Mapping[str, Any], ttl_sec: int = 86_400) -> None:
    """Store ``value`` for ``key`` for the provided TTL."""

    payload = stable_payload(value)
    _MEMO[key] = _MemoEntry(
        expires_at=time.time() + max(1, int(ttl_sec)), payload=payload
    )


def recall(key: str) -> Dict[str, Any] | None:
    """Retrieve the stored payload for ``key`` if it has not expired."""

    entry = _MEMO.get(key)
    if entry is None:
        return None
    if time.time() > entry.expires_at:
        _MEMO.pop(key, None)
        return None
    # Return a shallow copy to protect against accidental mutation.
    return dict(entry.payload)


def stable_payload(data: Mapping[str, Any] | None) -> Dict[str, Any]:
    """Return a JSON-compatible copy of ``data`` with deterministic ordering."""

    if data is None:
        return {}
    encoded = json.dumps(data, sort_keys=True, default=_json_default)
    return json.loads(encoded)


def fingerprint(data: Mapping[str, Any] | None) -> str:
    """Compute a stable fingerprint for ``data`` suitable for telemetry."""

    digest = hashlib.sha256(json.dumps(data or {}, sort_keys=True).encode("utf-8"))
    return digest.hexdigest()


def _json_default(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", errors="ignore")
    if hasattr(value, "dict"):
        return value.dict()  # type: ignore[no-any-return]
    if hasattr(value, "model_dump"):
        return value.model_dump()  # type: ignore[no-any-return]
    raise TypeError(f"Value of type {type(value)!r} is not JSON serialisable")
