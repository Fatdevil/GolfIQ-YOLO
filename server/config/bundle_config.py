from __future__ import annotations


import os
from collections.abc import Mapping
from typing import Any

from . import coerce_boolish
from . import remote as remote_config

DEFAULT_TTL_SECONDS = 604_800
_DEFAULT_ENABLED = True


def _remote_bundle_config() -> Mapping[str, Any]:
    try:
        config, _, _ = remote_config._store.snapshot()  # type: ignore[attr-defined]
    except AttributeError:
        return {}
    bundle_cfg = config.get("bundle")
    if isinstance(bundle_cfg, Mapping):
        return bundle_cfg
    return {}


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def bundle_enabled() -> bool:
    env_override = coerce_boolish(os.getenv("BUNDLE_ENABLED"))
    if env_override is not None:
        return env_override

    remote_enabled = _remote_bundle_config().get("enabled")
    if isinstance(remote_enabled, bool):
        return remote_enabled
    if isinstance(remote_enabled, str):
        coerced = coerce_boolish(remote_enabled)
        if coerced is not None:
            return coerced

    return _DEFAULT_ENABLED


def get_bundle_ttl() -> int:
    env_ttl = _coerce_int(os.getenv("BUNDLE_TTL_SECONDS"))
    if env_ttl is not None and env_ttl >= 0:
        return env_ttl

    remote_ttl = _coerce_int(_remote_bundle_config().get("ttlSeconds"))
    if remote_ttl is not None and remote_ttl >= 0:
        return remote_ttl

    return DEFAULT_TTL_SECONDS


__all__ = ["bundle_enabled", "get_bundle_ttl", "DEFAULT_TTL_SECONDS"]
