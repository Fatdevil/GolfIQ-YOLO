from __future__ import annotations

import os

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Tuple

_DEFAULT_TTL_SECONDS = 900


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        candidate = int(value)
    except ValueError:
        return default
    return candidate if candidate > 0 else default


def _features_env(raw: str | None) -> Tuple[str, ...]:
    if not raw:
        return ()
    items = [item.strip() for item in raw.split(",") if item.strip()]
    # Preserve order but drop duplicates
    seen: dict[str, None] = {}
    for item in items:
        seen.setdefault(item, None)
    return tuple(seen.keys())


@dataclass(frozen=True)
class BundleConfig:
    ttl_seconds: int
    data_root: Path
    default_features: Tuple[str, ...]

    def course_path(self, course_id: str) -> Path:
        return self.data_root / f"{course_id}.json"


@lru_cache(maxsize=1)
def get_bundle_config() -> BundleConfig:
    ttl = _int_env("OFFLINE_BUNDLE_TTL_SEC", _DEFAULT_TTL_SECONDS)
    data_root_env = os.getenv("OFFLINE_BUNDLE_DATA_ROOT")
    if data_root_env:
        data_root = Path(data_root_env)
    else:
        data_root = Path(__file__).resolve().parents[2] / "data" / "courses"
    features = _features_env(os.getenv("OFFLINE_BUNDLE_FEATURES"))
    return BundleConfig(ttl_seconds=ttl, data_root=data_root, default_features=features)


def reset_bundle_config_cache() -> None:
    get_bundle_config.cache_clear()


__all__ = ["BundleConfig", "get_bundle_config", "reset_bundle_config_cache"]
