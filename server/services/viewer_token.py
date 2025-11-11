"""Viewer token signing helpers for live playback."""

from __future__ import annotations

import base64
import json
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


def _encode_json(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _urlsafe_b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _urlsafe_b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _pack_token(viewer_id: str, exp: int, signature: str) -> str:
    return _SEPARATOR.join([viewer_id, str(exp), signature])


def _unpack_token(token: str) -> Tuple[str, int, str]:
    parts = token.split(_SEPARATOR)
    if len(parts) != 3:
        raise ValueError("invalid token format")
    viewer_id, exp_raw, signature = parts
    exp = int(exp_raw)
    return viewer_id, exp, signature


def _sign_invite_payload(payload: Dict[str, Any]) -> str:
    raw = _encode_json(payload)
    digest = hmac.new(_get_sign_key(), raw, sha256).digest()
    return _urlsafe_b64encode(digest)


def _pack_invite(payload: Dict[str, Any]) -> str:
    raw = _encode_json(payload)
    encoded = _urlsafe_b64encode(raw)
    signature = _sign_invite_payload(payload)
    return _SEPARATOR.join([encoded, signature])


def _unpack_invite(invite: str) -> Dict[str, Any]:
    try:
        encoded, signature = invite.split(_SEPARATOR, 1)
    except ValueError as exc:
        raise ValueError("invalid invite format") from exc

    raw = _urlsafe_b64decode(encoded)
    payload = json.loads(raw.decode("utf-8"))

    expected = _sign_invite_payload(payload)
    if not hmac.compare_digest(signature, expected):
        raise ValueError("invalid invite signature")
    return payload


def mint_viewer_token(event_id: str, ttl_s: int = 900) -> Dict[str, Any]:
    viewer_id = uuid4().hex
    exp = int(time()) + int(max(ttl_s, 1))
    signature = _sign_payload(viewer_id, event_id, exp)
    token = _pack_token(viewer_id, exp, signature)
    return {"token": token, "exp": exp}


def mint_invite(event_id: str, ttl_s: int = 900) -> Dict[str, Any]:
    exp = int(time()) + int(max(ttl_s, 1))
    payload = {"type": "invite", "event": event_id, "exp": exp}
    invite = _pack_invite(payload)
    return {"invite": invite, "exp": exp}


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


def exchange_invite(invite: str) -> Dict[str, Any]:
    payload = _unpack_invite(invite)

    if payload.get("type") != "invite":
        raise ValueError("invalid invite type")

    event_id = payload.get("event")
    if not isinstance(event_id, str) or not event_id:
        raise ValueError("invalid invite event")

    exp_raw = payload.get("exp")
    if not isinstance(exp_raw, int):
        raise ValueError("invalid invite expiry")
    exp = int(exp_raw)
    now = int(time())
    if exp <= now:
        raise ValueError("invite expired")

    ttl_remaining = max(exp - now, 1)
    minted = mint_viewer_token(event_id, ttl_s=ttl_remaining)
    metadata = decode_token(minted["token"]) or {}
    viewer_id = metadata.get("viewerId")
    return {
        "token": minted["token"],
        "viewerId": viewer_id,
        "exp": minted["exp"],
        "eventId": event_id,
    }
