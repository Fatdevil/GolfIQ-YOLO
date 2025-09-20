"""Configuration helpers for server constants."""

from __future__ import annotations

import os


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


MAX_ZIP_SIZE_BYTES: int = _int_env("MAX_ZIP_SIZE_BYTES", 50_000_000)
MAX_ZIP_FILES: int = _int_env("MAX_ZIP_FILES", 400)
MAX_ZIP_RATIO: float = _float_env("MAX_ZIP_RATIO", 200.0)
MAX_VIDEO_BYTES: int = _int_env("MAX_VIDEO_BYTES", 80_000_000)

ENABLE_SPIN: bool = env_bool("ENABLE_SPIN", False)
CAPTURE_IMPACT_FRAMES: bool = env_bool("CAPTURE_IMPACT_FRAMES", True)
IMPACT_CAPTURE_BEFORE: int = _int_env("IMPACT_CAPTURE_BEFORE", 2)
IMPACT_CAPTURE_AFTER: int = _int_env("IMPACT_CAPTURE_AFTER", 6)
