"""Aim then calibrate flow logic for the AR-HUD MVP."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from arhud.timing import HoldTimer, Stopwatch


class AimCalibratePhase(str, Enum):
    IDLE = "idle"
    AIMING = "aiming"
    CALIBRATING = "calibrating"
    READY = "ready"


@dataclass
class AimCalibrateSnapshot:
    phase: AimCalibratePhase
    hold_ratio: float
    calibration_ratio: float


class AimCalibrateFlow:
    """Two-stage Aim → Calibrate flow state machine."""

    def __init__(
        self,
        *,
        alignment_threshold_degrees: float = 1.5,
        hold_duration: float = 1.0,
        calibration_duration: float = 0.75,
    ) -> None:
        if alignment_threshold_degrees <= 0:
            raise ValueError("alignment_threshold_degrees must be positive")
        if hold_duration <= 0:
            raise ValueError("hold_duration must be positive")
        if calibration_duration <= 0:
            raise ValueError("calibration_duration must be positive")
        self.alignment_threshold_degrees = alignment_threshold_degrees
        self.hold_duration = hold_duration
        self.calibration_duration = calibration_duration
        self._phase = AimCalibratePhase.IDLE
        self._hold_timer = HoldTimer(required=hold_duration)
        self._calibration_timer = Stopwatch()
        self._calibration_complete = False

    @property
    def phase(self) -> AimCalibratePhase:
        return self._phase

    def start(self) -> AimCalibrateSnapshot:
        self._phase = AimCalibratePhase.AIMING
        self._hold_timer.reset()
        self._calibration_timer.reset()
        self._calibration_complete = False
        return self.snapshot()

    def reset(self) -> AimCalibrateSnapshot:
        self._phase = AimCalibratePhase.IDLE
        self._hold_timer.reset()
        self._calibration_timer.reset()
        self._calibration_complete = False
        return self.snapshot()

    def update(
        self,
        *,
        alignment_error_degrees: float,
        dt: float,
        calibration_signal: bool = False,
    ) -> AimCalibrateSnapshot:
        if dt < 0:
            raise ValueError("dt must be non-negative")
        if self._phase == AimCalibratePhase.IDLE:
            return self.snapshot()

        if self._phase == AimCalibratePhase.AIMING:
            within_threshold = (
                abs(alignment_error_degrees) <= self.alignment_threshold_degrees
            )
            self._hold_timer.update(within_threshold, dt)
            if self._hold_timer.is_complete:
                self._phase = AimCalibratePhase.CALIBRATING
                self._calibration_timer.reset()

        if self._phase == AimCalibratePhase.CALIBRATING:
            self._calibration_timer.tick(dt)
            if calibration_signal:
                self._calibration_complete = True
            if (
                self._calibration_timer.elapsed >= self.calibration_duration
                or self._calibration_complete
            ):
                self._phase = AimCalibratePhase.READY

        return self.snapshot()

    def acknowledge_ready(self) -> AimCalibrateSnapshot:
        if self._phase == AimCalibratePhase.READY:
            self.reset()
        return self.snapshot()

    def snapshot(self) -> AimCalibrateSnapshot:
        if self._phase == AimCalibratePhase.AIMING:
            hold_ratio = self._hold_timer.ratio
            calibration_ratio = 0.0
        elif self._phase == AimCalibratePhase.CALIBRATING:
            hold_ratio = 1.0
            calibration_ratio = min(
                1.0, self._calibration_timer.elapsed / self.calibration_duration
            )
        elif self._phase == AimCalibratePhase.READY:
            hold_ratio = 1.0
            calibration_ratio = 1.0
        else:
            hold_ratio = 0.0
            calibration_ratio = 0.0
        return AimCalibrateSnapshot(
            phase=self._phase,
            hold_ratio=hold_ratio,
            calibration_ratio=calibration_ratio,
        )
