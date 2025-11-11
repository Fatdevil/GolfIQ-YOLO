"""Viewer token signing helpers for live playback."""

from __future__ import annotations

import base64
import hmac
import os
from hashlib import sha256
from time import time
from typing import Any, Dict, Tuple
from uuid import uuid4

from server.services import live_stream

_SEPARATOR = "."


def _get_sign_key() -> bytes:
    key = os.getenv("LIVE_VIEWER_SIGN_KEY")
    if not key:
        raise RuntimeError("viewer token signing disabled")
    return key.encode("utf-8")


def _sign_payload(viewer_id: str, event_id: str, exp: int) -> str:
    payload = f"{viewer_id}|{event_id}|{exp}".encode("utf-8")
    digest = hmac.new(_get_sign_key(), payload, sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _pack_token(viewer_id: str, exp: int, signature: str) -> str:
    return _SEPARATOR.join([viewer_id, str(exp), signature])


def _unpack_token(token: str) -> Tuple[str, int, str]:
    parts = token.split(_SEPARATOR)
    if len(parts) != 3:
        raise ValueError("invalid token format")
    viewer_id, exp_raw, signature = parts
    exp = int(exp_raw)
    return viewer_id, exp, signature


def mint_viewer_token(event_id: str, ttl_s: int = 900) -> Dict[str, Any]:
    viewer_id = uuid4().hex
    exp = int(time()) + int(max(ttl_s, 1))
    signature = _sign_payload(viewer_id, event_id, exp)
    token = _pack_token(viewer_id, exp, signature)
    return {"token": token, "exp": exp}


def verify_viewer_token(event_id: str, token: str) -> bool:
    try:
        viewer_id, exp, signature = _unpack_token(token)
    except (ValueError, TypeError):
        return False

    if exp <= int(time()):
        return False

    expected = _sign_payload(viewer_id, event_id, exp)
    if not hmac.compare_digest(signature, expected):
        return False

    live_stream.register_viewer(event_id, viewer_id)
    return True


def decode_token(token: str) -> Dict[str, Any] | None:
    try:
        viewer_id, exp, signature = _unpack_token(token)
        return {"viewerId": viewer_id, "exp": exp, "signature": signature}
    except Exception:  # pragma: no cover - best-effort helper
        return None
