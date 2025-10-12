from __future__ import annotations

import os
from typing import Any, Mapping, Optional

from fastapi import Request

from . import coerce_boolish

DEFAULT_ENABLED = True
DEFAULT_TTL_SECONDS = 604800


def _coerce_ttl(value: Any) -> Optional[int]:
    try:
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str) and value.strip():
            return int(float(value))
    except (TypeError, ValueError):
        return None
    return None


def _extract_bundle_config(source: Any) -> Optional[Mapping[str, Any]]:
    if not isinstance(source, Mapping):
        return None
    if "bundle" in source and isinstance(source["bundle"], Mapping):
        return source["bundle"]
    if "enabled" in source or "ttlSeconds" in source:
        return source
    for value in source.values():
        nested = _extract_bundle_config(value)
        if nested is not None:
            return nested
    return None


def _bundle_config_from_request(request: Request | None) -> Optional[Mapping[str, Any]]:
    if request is None:
        return None
    state = getattr(request, "state", None)
    if state is None:
        return None
    candidates = [
        getattr(state, "bundle_config", None),
        getattr(state, "remote_config", None),
    ]
    for candidate in candidates:
        config = _extract_bundle_config(candidate)
        if config is not None:
            return config
    return None


def is_bundle_enabled(request: Request | None = None) -> bool:
    env_toggle = coerce_boolish(os.getenv("BUNDLE_ENABLED"))
    if env_toggle is not None:
        return env_toggle
    config = _bundle_config_from_request(request)
    if config is not None:
        rc_toggle = coerce_boolish(config.get("enabled"))
        if rc_toggle is not None:
            return rc_toggle
    return DEFAULT_ENABLED


def get_bundle_ttl(request: Request | None = None) -> int:
    env_ttl = _coerce_ttl(os.getenv("BUNDLE_TTL_SECONDS"))
    if env_ttl is not None and env_ttl > 0:
        return env_ttl
    config = _bundle_config_from_request(request)
    if config is not None:
        rc_ttl = _coerce_ttl(config.get("ttlSeconds"))
        if rc_ttl is not None and rc_ttl > 0:
            return rc_ttl
    return DEFAULT_TTL_SECONDS


__all__ = ["DEFAULT_TTL_SECONDS", "get_bundle_ttl", "is_bundle_enabled"]
