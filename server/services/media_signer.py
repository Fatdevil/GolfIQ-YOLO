from __future__ import annotations

import hashlib
import hmac
import time
import urllib.parse
from typing import Mapping

__all__ = ["sign", "build_url"]


def _b64(data: bytes) -> str:
    """URL-safe encoding helper primarily for future compatibility."""

    return urllib.parse.quote_plus(data.hex())


def sign(path: str, key: str, ttl_s: int = 900) -> Mapping[str, int | str]:
    """Return signing metadata for the given ``path``.

    The signature is produced as an HMAC-SHA256 digest over ``path`` and the
    computed expiration timestamp.
    """

    assert path.startswith("/hls/") or path.startswith("/media/"), "path not allowed"

    ttl_s = max(60, min(int(ttl_s), 3600))
    exp = int(time.time()) + ttl_s
    message = f"{path}:{exp}".encode()
    digest = hmac.new(key.encode(), message, hashlib.sha256).digest()
    return {"path": path, "exp": exp, "sig": digest.hex()}


def build_url(base: str, signed: Mapping[str, int | str]) -> str:
    """Construct a signed playback URL from the provided ``signed`` payload."""

    base = (base or "").rstrip("/")
    path = str(signed["path"])
    query = urllib.parse.urlencode({"exp": signed["exp"], "sig": signed["sig"]})
    return f"{base}{path}?{query}"
