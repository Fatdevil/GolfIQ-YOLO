"""Re-center control loop for the AR-HUD MVP."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from arhud.constants import RECENTER_SLO_SECONDS
from arhud.timing import HoldTimer, Stopwatch


class RecenterState(str, Enum):
    IDLE = "idle"
    RECENTERING = "recentering"
    STABLE = "stable"
    FAILED = "failed"


@dataclass
class RecenterSnapshot:
    state: RecenterState
    stability_ratio: float
    timeout_ratio: float


class RecenterFlow:
    """Handles re-centering requests with timeout and stability tracking."""

    def __init__(
        self,
        *,
        stability_threshold_meters: float = 0.2,
        stability_duration: float = 0.4,
        timeout_seconds: float = RECENTER_SLO_SECONDS,
    ) -> None:
        if stability_threshold_meters <= 0:
            raise ValueError("stability_threshold_meters must be positive")
        if stability_duration <= 0:
            raise ValueError("stability_duration must be positive")
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        self.stability_threshold_meters = stability_threshold_meters
        self.stability_duration = stability_duration
        self.timeout_seconds = timeout_seconds
        self._state = RecenterState.IDLE
        self._stability_timer = HoldTimer(required=stability_duration)
        self._timeout_timer = Stopwatch()

    @property
    def state(self) -> RecenterState:
        return self._state

    def request(self) -> RecenterSnapshot:
        self._state = RecenterState.RECENTERING
        self._stability_timer.reset()
        self._timeout_timer.reset()
        return self.snapshot()

    def reset(self) -> RecenterSnapshot:
        self._state = RecenterState.IDLE
        self._stability_timer.reset()
        self._timeout_timer.reset()
        return self.snapshot()

    def update(self, *, offset_meters: float, dt: float) -> RecenterSnapshot:
        if dt < 0:
            raise ValueError("dt must be non-negative")
        if self._state not in {RecenterState.RECENTERING}:
            return self.snapshot()

        within_threshold = abs(offset_meters) <= self.stability_threshold_meters
        self._stability_timer.update(within_threshold, dt)
        self._timeout_timer.tick(dt)

        if self._stability_timer.is_complete:
            self._state = RecenterState.STABLE
        elif self._timeout_timer.elapsed >= self.timeout_seconds:
            self._state = RecenterState.FAILED

        return self.snapshot()

    def acknowledge(self) -> RecenterSnapshot:
        if self._state in {RecenterState.STABLE, RecenterState.FAILED}:
            self.reset()
        return self.snapshot()

    def snapshot(self) -> RecenterSnapshot:
        if self._state == RecenterState.RECENTERING:
            stability_ratio = self._stability_timer.ratio
            timeout_ratio = min(1.0, self._timeout_timer.elapsed / self.timeout_seconds)
        elif self._state == RecenterState.STABLE:
            stability_ratio = 1.0
            timeout_ratio = min(1.0, self._timeout_timer.elapsed / self.timeout_seconds)
        elif self._state == RecenterState.FAILED:
            stability_ratio = self._stability_timer.ratio
            timeout_ratio = 1.0
        else:
            stability_ratio = 0.0
            timeout_ratio = 0.0
        return RecenterSnapshot(
            state=self._state,
            stability_ratio=stability_ratio,
            timeout_ratio=timeout_ratio,
        )
