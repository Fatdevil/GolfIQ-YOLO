"""Lightweight timing utilities for deterministic flow orchestration."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Stopwatch:
    """Accumulates elapsed time in seconds when explicitly advanced."""

    elapsed: float = 0.0

    def tick(self, dt: float) -> float:
        if dt < 0:
            raise ValueError("dt must be non-negative")
        self.elapsed += dt
        return self.elapsed

    def reset(self) -> None:
        self.elapsed = 0.0


@dataclass
class HoldTimer:
    """Tracks how long a condition has remained satisfied."""

    required: float
    progress: float = 0.0

    def update(self, condition: bool, dt: float) -> float:
        if dt < 0:
            raise ValueError("dt must be non-negative")
        if condition:
            self.progress = min(self.required, self.progress + dt)
        else:
            self.progress = 0.0
        return self.progress

    def reset(self) -> None:
        self.progress = 0.0

    @property
    def ratio(self) -> float:
        if self.required <= 0:
            return 1.0
        return max(0.0, min(1.0, self.progress / self.required))

    @property
    def is_complete(self) -> bool:
        return self.progress >= self.required
