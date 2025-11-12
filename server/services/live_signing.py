"""Utilities for signing live viewer URLs."""

from __future__ import annotations

import hashlib
import hmac
import time
import urllib.parse
from typing import Tuple

__all__ = ["sign_url"]


def _now_s() -> int:
    """Return the current unix timestamp in seconds."""

    return int(time.time())


def sign_url(origin_url: str, secret: str, ttl_sec: int) -> Tuple[str, int]:
    """Return a CDN-safe signed URL and its expiration timestamp."""

    ttl = max(30, int(ttl_sec))
    exp = _now_s() + ttl
    parsed = urllib.parse.urlparse(origin_url)
    payload = f"{parsed.path}?exp={exp}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()

    query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    query["exp"] = [str(exp)]
    query["sig"] = [signature]
    encoded_query = urllib.parse.urlencode(query, doseq=True)

    signed = urllib.parse.urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            encoded_query,
            parsed.fragment,
        )
    )
    return signed, exp
