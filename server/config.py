"""Configuration helpers for server constants."""

from __future__ import annotations

import os


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
