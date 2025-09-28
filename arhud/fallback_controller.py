from __future__ import annotations

from dataclasses import dataclass

from arhud.revalidation import should_revalidate


default_threshold_quality = 0.6

default_timeout = 2.0


@dataclass
class FallbackState:
    compass_mode: bool = False
    seconds_in_degraded: float = 0.0


class FallbackController:
    def __init__(self, degrade_threshold: float = default_threshold_quality, timeout: float = default_timeout) -> None:
        self._threshold = degrade_threshold
        self._timeout = timeout
        self._state = FallbackState()

    def step(self, tracking_quality: float, dt: float) -> FallbackState:
        if tracking_quality < self._threshold:
            self._state.seconds_in_degraded += dt
        else:
            self._state.seconds_in_degraded = 0.0
            self._state.compass_mode = False
        if self._state.seconds_in_degraded >= self._timeout:
            self._state.compass_mode = True
        return self._state

    @property
    def state(self) -> FallbackState:
        return self._state