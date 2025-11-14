"""Configuration flags for the lightweight caddie service."""

from __future__ import annotations

import os

MIN_CONFIDENCE_NORMAL: float = float(os.getenv("CADDIE_MIN_CONFIDENCE", "0.6"))

__all__ = ["MIN_CONFIDENCE_NORMAL"]
