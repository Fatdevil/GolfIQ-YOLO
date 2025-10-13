from __future__ import annotations

import os
from typing import Any, Mapping, MutableMapping

from . import coerce_boolish

DEFAULT_BUNDLE_ENABLED = True
DEFAULT_BUNDLE_TTL_SECONDS = 604_800


def _extract_bundle_section(
    source: Mapping[str, Any] | None,
) -> Mapping[str, Any] | None:
    if not isinstance(source, Mapping):
        return None
    bundle = source.get("bundle")
    if isinstance(bundle, Mapping):
        return bundle
    return source if {"enabled", "ttlSeconds"} & set(source.keys()) else None


def _coerce_positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, float):
        return int(value) if value > 0 else None
    if isinstance(value, str):
        try:
            parsed = int(value.strip())
        except ValueError:
            return None
        return parsed if parsed > 0 else None
    return None


def _merge_config(source: Mapping[str, Any] | None) -> MutableMapping[str, Any]:
    config: MutableMapping[str, Any] = {
        "enabled": DEFAULT_BUNDLE_ENABLED,
        "ttlSeconds": DEFAULT_BUNDLE_TTL_SECONDS,
    }
    section = _extract_bundle_section(source)
    if not section:
        return config
    enabled = section.get("enabled")
    if isinstance(enabled, bool):
        config["enabled"] = enabled
    ttl = _coerce_positive_int(section.get("ttlSeconds"))
    if ttl is not None:
        config["ttlSeconds"] = ttl
    return config


def is_bundle_enabled(remote_config: Mapping[str, Any] | None = None) -> bool:
    config = _merge_config(remote_config)
    env_toggle = coerce_boolish(os.getenv("BUNDLE_ENABLED"))
    if env_toggle is not None:
        return env_toggle
    return bool(config["enabled"])


def get_bundle_ttl(remote_config: Mapping[str, Any] | None = None) -> int:
    config = _merge_config(remote_config)
    env_ttl = _coerce_positive_int(os.getenv("BUNDLE_TTL_SECONDS"))
    if env_ttl is not None:
        return env_ttl
    ttl = _coerce_positive_int(config.get("ttlSeconds"))
    return ttl if ttl is not None else DEFAULT_BUNDLE_TTL_SECONDS


__all__ = [
    "DEFAULT_BUNDLE_ENABLED",
    "DEFAULT_BUNDLE_TTL_SECONDS",
    "get_bundle_ttl",
    "is_bundle_enabled",
]
