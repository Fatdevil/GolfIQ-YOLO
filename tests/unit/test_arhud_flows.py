from __future__ import annotations

import pytest

from arhud.flows import AimCalibrateFlow, AimCalibratePhase, RecenterFlow, RecenterState


class TestAimCalibrateFlow:
    def test_transition_aim_to_calibrate_to_ready(self) -> None:
        flow = AimCalibrateFlow(
            alignment_threshold_degrees=1.0,
            hold_duration=0.5,
            calibration_duration=0.4,
        )

        snapshot = flow.start()
        assert snapshot.phase == AimCalibratePhase.AIMING
        assert snapshot.hold_ratio == pytest.approx(0.0)

        snapshot = flow.update(alignment_error_degrees=2.0, dt=0.25)
        assert snapshot.phase == AimCalibratePhase.AIMING
        assert snapshot.hold_ratio == pytest.approx(0.0)

        snapshot = flow.update(alignment_error_degrees=0.5, dt=0.25)
        assert snapshot.phase == AimCalibratePhase.AIMING
        assert snapshot.hold_ratio == pytest.approx(0.5)

        snapshot = flow.update(alignment_error_degrees=0.1, dt=0.3)
        assert snapshot.phase == AimCalibratePhase.CALIBRATING
        assert snapshot.hold_ratio == pytest.approx(1.0)
        assert 0.0 < snapshot.calibration_ratio <= 1.0

        snapshot = flow.update(alignment_error_degrees=0.2, dt=0.4)
        assert snapshot.phase == AimCalibratePhase.READY
        assert snapshot.calibration_ratio == pytest.approx(1.0)

        snapshot = flow.acknowledge_ready()
        assert snapshot.phase == AimCalibratePhase.IDLE

    def test_calibration_signal_shortcuts_timer(self) -> None:
        flow = AimCalibrateFlow(
            alignment_threshold_degrees=2.0,
            hold_duration=0.1,
            calibration_duration=10.0,
        )
        flow.start()
        flow.update(alignment_error_degrees=0.1, dt=0.2)
        snapshot = flow.update(alignment_error_degrees=0.1, dt=0.1, calibration_signal=True)
        assert snapshot.phase == AimCalibratePhase.READY


class TestRecenterFlow:
    def test_recenter_success_before_timeout(self) -> None:
        flow = RecenterFlow(stability_threshold_meters=0.2, stability_duration=0.5, timeout_seconds=2.0)

        snapshot = flow.request()
        assert snapshot.state == RecenterState.RECENTERING

        flow.update(offset_meters=0.5, dt=0.3)
        flow.update(offset_meters=0.1, dt=0.3)
        snapshot = flow.update(offset_meters=0.05, dt=0.3)
        assert snapshot.state == RecenterState.STABLE
        assert snapshot.stability_ratio == pytest.approx(1.0)
        assert snapshot.timeout_ratio == pytest.approx(0.45, rel=1e-2)

        snapshot = flow.acknowledge()
        assert snapshot.state == RecenterState.IDLE

    def test_recenter_timeout_failure(self) -> None:
        flow = RecenterFlow(stability_threshold_meters=0.1, stability_duration=0.4, timeout_seconds=1.0)
        flow.request()

        flow.update(offset_meters=0.5, dt=0.5)
        snapshot = flow.update(offset_meters=0.5, dt=0.6)
        assert snapshot.state == RecenterState.FAILED
        assert snapshot.timeout_ratio == pytest.approx(1.0)
        snapshot = flow.acknowledge()
        assert snapshot.state == RecenterState.IDLE

    def test_negative_dt_guard(self) -> None:
        flow = RecenterFlow()
        flow.request()
        with pytest.raises(ValueError):
            flow.update(offset_meters=0.0, dt=-0.1)
