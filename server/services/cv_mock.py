"""Utilities for selecting CV mock vs. real backends."""

from __future__ import annotations

from typing import Any

from server.config import coerce_boolish, get_settings, yolo_inference_enabled


def effective_mock(*candidates: Any) -> bool:
    """Return the effective mock flag using the provided candidates.

    Values are evaluated in order and the first non-``None`` candidate wins.
    If all candidates are ``None``, the environment default (``CV_MOCK``) is
    used instead.
    """

    for candidate in candidates:
        coerced = coerce_boolish(candidate)
        if coerced is not None:
            return coerced
    if yolo_inference_enabled():
        return False
    return get_settings().cv_mock
