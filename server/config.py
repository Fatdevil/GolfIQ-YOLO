"""Configuration helpers for server constants."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

try:  # Pydantic v2
    from pydantic_settings import BaseSettings, SettingsConfigDict  # type: ignore
except ImportError:  # pragma: no cover - fallback for pydantic v1
    from pydantic import BaseSettings  # type: ignore

    SettingsConfigDict = None  # type: ignore

from pydantic import Field


class _Settings(BaseSettings):
    cv_mock: bool = Field(default=True, alias="CV_MOCK")

    if SettingsConfigDict is not None:  # pragma: no branch
        model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    else:  # pragma: no cover - executed on pydantic v1
        class Config:
            env_file = ".env"
            case_sensitive = False


@lru_cache(maxsize=1)
def get_settings() -> _Settings:
    """Return cached application settings."""

    return _Settings()  # type: ignore[call-arg]


def reset_settings_cache() -> None:
    """Clear cached settings (primarily for tests)."""

    get_settings.cache_clear()


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

_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}


def coerce_boolish(value: Any) -> bool | None:
    """Attempt to coerce *value* into a boolean."""

    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in _TRUE_VALUES:
            return True
        if lowered in _FALSE_VALUES:
            return False
    return None
