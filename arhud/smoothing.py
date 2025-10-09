"""Heading smoothing helpers for HUD stability metrics."""

from __future__ import annotations

from collections import deque
from math import atan2, cos, degrees, radians, sin, sqrt
from typing import Deque, Tuple

from .constants import HEADING_SLO_WINDOW_SECONDS

Sample = Tuple[float, float]


def _wrap_angle(degrees: float) -> float:
    wrapped = (degrees + 180.0) % 360.0 - 180.0
    # Normalise -180 to 180 exactly.
    if wrapped == -180.0:
        return 180.0
    return wrapped


class HeadingSmoother:
    """Maintains a rolling heading estimate with RMS stability tracking."""

    def __init__(self, window_seconds: float = HEADING_SLO_WINDOW_SECONDS) -> None:
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        self.window_seconds = float(window_seconds)
        self._samples: Deque[Sample] = deque()
        self._total_weight = 0.0
        self._last_heading = 0.0

    def update(self, heading_degrees: float, dt: float) -> float:
        if dt < 0:
            raise ValueError("dt must be non-negative")
        self._last_heading = heading_degrees
        if dt == 0:
            return self.mean()
        self._samples.append((heading_degrees, dt))
        self._total_weight += dt
        self._evict_old_samples()
        return self.mean()

    def mean(self) -> float:
        if not self._samples or self._total_weight <= 0:
            return self._last_heading
        sum_sin = 0.0
        sum_cos = 0.0
        for heading, weight in self._samples:
            rad = radians(heading)
            sum_sin += sin(rad) * weight
            sum_cos += cos(rad) * weight
        if sum_cos == 0 and sum_sin == 0:
            return self._last_heading
        return degrees(atan2(sum_sin, sum_cos))

    def rms(self) -> float:
        if not self._samples or self._total_weight <= 0:
            return 0.0
        mean_heading = self.mean()
        accumulator = 0.0
        for heading, weight in self._samples:
            delta = _wrap_angle(heading - mean_heading)
            accumulator += (delta * delta) * weight
        variance = accumulator / self._total_weight
        return sqrt(variance)

    def _evict_old_samples(self) -> None:
        target = self.window_seconds
        while self._total_weight > target and self._samples:
            heading, weight = self._samples[0]
            overflow = self._total_weight - target
            if overflow >= weight:
                self._samples.popleft()
                self._total_weight -= weight
                continue
            self._samples[0] = (heading, weight - overflow)
            self._total_weight -= overflow
            break
