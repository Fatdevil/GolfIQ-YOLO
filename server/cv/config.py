"""Configuration helpers for CV backend selection."""

from __future__ import annotations

import os
from enum import Enum


class CvBackend(str, Enum):
    """Supported computer vision backends for range practice."""

    MOCK = "mock"
    REAL = "real"


_DEFAULT_BACKEND = CvBackend.MOCK
_ENV_VAR = "RANGE_PRACTICE_CV_BACKEND"


def get_range_backend() -> CvBackend:
    """Return the configured backend for range practice CV analysis."""

    raw = os.getenv(_ENV_VAR, _DEFAULT_BACKEND.value)
    if not raw:
        return _DEFAULT_BACKEND
    value = raw.strip().lower()
    if value == CvBackend.REAL.value:
        return CvBackend.REAL
    return CvBackend.MOCK


__all__ = ["CvBackend", "get_range_backend"]
