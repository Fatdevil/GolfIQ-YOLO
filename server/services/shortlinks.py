"""In-memory store for generated short links."""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Any, Callable, Dict, Optional
import secrets
import time


@dataclass
class ShortLink:
    sid: str
    url: str
    title: str
    description: str
    image: Optional[str]
    created_ts: int
    clip_id: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


_STORE: Dict[str, ShortLink] = {}
_LOCK = Lock()


def _new_id(n: int = 8) -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "".join(secrets.choice(alphabet) for _ in range(n))


def create(
    url: str | Callable[[str], str],
    title: str,
    description: str,
    image: Optional[str],
    *,
    clip_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> ShortLink:
    """Persist a short link and return the stored record."""

    with _LOCK:
        sid = _new_id()
        while sid in _STORE:
            sid = _new_id()
        resolved_url = url(sid) if callable(url) else url
        sl = ShortLink(
            sid=sid,
            url=resolved_url,
            title=title,
            description=description,
            image=image,
            created_ts=int(time.time() * 1000),
            clip_id=clip_id,
            payload=payload,
        )
        _STORE[sid] = sl
        return sl


def get(sid: str) -> Optional[ShortLink]:
    return _STORE.get(sid)


def _reset_state() -> None:
    with _LOCK:
        _STORE.clear()


__all__ = ["ShortLink", "create", "get", "_reset_state"]


def build_shortlink_url(base_url: str, sid: str) -> str:
    """Build an absolute shortlink URL from a base and shortlink id."""

    return f"{base_url.rstrip('/')}/s/{sid}"


__all__.append("build_shortlink_url")
