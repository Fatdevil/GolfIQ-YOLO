from __future__ import annotations

from typing import Protocol, Sequence

import numpy as np

from cv_engine.types import Box


class DetectionEngine(Protocol):
    """Stable interface for detection backends."""

    variant: str

    def detect(self, image: "np.ndarray") -> Sequence[Box]:
        """Run detection on a single frame."""

    def run(self, image: "np.ndarray") -> Sequence[Box]:
        """Alias kept for compatibility with existing pipeline usage."""
