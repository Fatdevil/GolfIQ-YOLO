import math
import random

from cv_engine.calibration.launch_window import LaunchWindowConfig, detect_launch_window
from cv_engine.calibration.scale import points_px_to_meters, resolve_scale
from cv_engine.calibration.trajectory_fit import fit_trajectory
from cv_engine.calibration.calibration_v1 import (
    CalibrationV1Config,
    calibrate_v1,
)
from cv_engine.calibration.types import CalibrationConfig, TrackPoint
from cv_engine.calibration.v1 import calibrated_metrics


def _synthetic_track(
    *,
    vx: float,
    vy: float,
    fps: float,
    scale_px_per_meter: float,
    frames: int,
    noise_px: float = 0.0,
    gap_start: int | None = None,
    gap_len: int = 0,
) -> list[TrackPoint]:
    rng = random.Random(42)
    points: list[TrackPoint] = []
    for frame_idx in range(frames):
        if gap_start is not None and gap_start <= frame_idx < gap_start + gap_len:
            continue
        t = frame_idx / fps
        x_m = vx * t
        y_m = vy * t - 0.5 * 9.81 * t * t
        x_px = x_m * scale_px_per_meter
        y_px = -y_m * scale_px_per_meter
        if noise_px:
            x_px += rng.uniform(-noise_px, noise_px)
            y_px += rng.uniform(-noise_px, noise_px)
        points.append(TrackPoint(frame_idx=frame_idx, x_px=x_px, y_px=y_px))
    return points


def test_pixel_to_meter_conversion_round_trip():
    config = CalibrationConfig(enabled=True, scale_px_per_meter=100.0)
    result = resolve_scale(config)
    assert result.meters_per_pixel is not None
    points_px = [(0.0, 0.0), (100.0, -200.0)]
    points_m = points_px_to_meters(points_px, meters_per_pixel=result.meters_per_pixel)
    assert math.isclose(points_m[1][0], 1.0, rel_tol=1e-6)
    assert math.isclose(points_m[1][1], 2.0, rel_tol=1e-6)


def test_launch_window_rejects_long_gaps():
    track = _synthetic_track(
        vx=20.0,
        vy=10.0,
        fps=120.0,
        scale_px_per_meter=90.0,
        frames=16,
        gap_start=6,
        gap_len=6,
    )
    window = detect_launch_window(track, config=LaunchWindowConfig(max_gap_frames=2))
    assert window.start_index is not None
    assert window.end_index is not None
    assert window.end_frame is not None
    assert window.end_frame < 6


def test_trajectory_fit_recovers_speed_and_angle():
    track = _synthetic_track(
        vx=30.0,
        vy=14.0,
        fps=120.0,
        scale_px_per_meter=120.0,
        frames=12,
    )
    fit = fit_trajectory(track, fps=120.0, meters_per_pixel=1 / 120.0)
    assert fit.calibrated is True
    assert math.isclose(fit.speed_mps or 0.0, math.hypot(30.0, 14.0), rel_tol=0.1)
    assert math.isclose(
        fit.launch_angle_deg or 0.0,
        math.degrees(math.atan2(14.0, 30.0)),
        rel_tol=0.1,
    )


def test_calibration_fallback_with_missing_scale():
    track = _synthetic_track(
        vx=25.0,
        vy=12.0,
        fps=120.0,
        scale_px_per_meter=80.0,
        frames=8,
        noise_px=0.5,
    )
    config = CalibrationConfig(enabled=True, camera_fps=120.0)
    metrics = calibrated_metrics(track, config)
    assert metrics["enabled"] is False
    assert "calibration_missing" in metrics["quality"]["reasonCodes"]


def test_calibration_v1_perfect_parabola_fit():
    fps = 120.0
    scale_px_per_meter = 100.0
    vx = 35.0
    vy = 18.0
    track = _synthetic_track(
        vx=vx,
        vy=vy,
        fps=fps,
        scale_px_per_meter=scale_px_per_meter,
        frames=16,
    )
    result = calibrate_v1(
        track,
        fps=fps,
        config=CalibrationV1Config(meters_per_pixel=1 / scale_px_per_meter),
    )
    assert result["status"] == "ok"
    expected_angle = math.degrees(math.atan2(vy, vx))
    expected_carry = vx * (2 * vy / 9.81)
    assert math.isclose(
        result["fit"]["launch_angle_deg"] or 0.0, expected_angle, rel_tol=0.05
    )
    assert math.isclose(
        result["fit"]["carry_m_est"] or 0.0, expected_carry, rel_tol=0.1
    )


def test_calibration_v1_handles_small_gap():
    fps = 120.0
    scale_px_per_meter = 90.0
    track = _synthetic_track(
        vx=28.0,
        vy=13.0,
        fps=fps,
        scale_px_per_meter=scale_px_per_meter,
        frames=14,
        gap_start=6,
        gap_len=1,
    )
    result = calibrate_v1(
        track,
        fps=fps,
        config=CalibrationV1Config(meters_per_pixel=1 / scale_px_per_meter),
    )
    assert result["status"] == "ok"
    assert result["launch_window"]["n_points"] >= 6


def test_calibration_v1_insufficient_points():
    track = _synthetic_track(
        vx=20.0,
        vy=10.0,
        fps=120.0,
        scale_px_per_meter=80.0,
        frames=4,
    )
    result = calibrate_v1(
        track,
        fps=120.0,
        config=CalibrationV1Config(meters_per_pixel=1 / 80.0),
    )
    assert result["status"] == "insufficient_data"


def test_calibration_v1_fallback_scale_low_confidence():
    track = _synthetic_track(
        vx=22.0,
        vy=11.0,
        fps=120.0,
        scale_px_per_meter=85.0,
        frames=12,
    )
    result = calibrate_v1(track, fps=120.0, config=CalibrationV1Config())
    assert result["status"] == "low_confidence"
    assert "fallback_scale" in result["quality"]["reasons"]


def test_calibration_v1_flat_trajectory_uses_rmse():
    fps = 120.0
    scale_px_per_meter = 100.0
    points = []
    for frame_idx in range(12):
        t = frame_idx / fps
        x_m = 30.0 * t
        x_px = x_m * scale_px_per_meter
        points.append(TrackPoint(frame_idx=frame_idx, x_px=x_px, y_px=0.0))
    result = calibrate_v1(
        points,
        fps=fps,
        config=CalibrationV1Config(meters_per_pixel=1 / scale_px_per_meter),
    )
    assert result["fit"]["fit_metric"] == "rmse"
    assert math.isclose(result["fit"]["fit_rmse"] or 0.0, 0.0, abs_tol=1e-6)
    assert "fit_rmse_high" not in result["quality"]["reasons"]
    assert "fit_r2_low" not in result["quality"]["reasons"]


def test_calibration_v1_rmse_threshold_triggers():
    fps = 120.0
    scale_px_per_meter = 100.0
    track = _synthetic_track(
        vx=25.0,
        vy=12.0,
        fps=fps,
        scale_px_per_meter=scale_px_per_meter,
        frames=12,
        noise_px=60.0,
    )
    result = calibrate_v1(
        track,
        fps=fps,
        config=CalibrationV1Config(
            meters_per_pixel=1 / scale_px_per_meter,
            max_fit_rmse_m=0.1,
        ),
    )
    assert "fit_rmse_high" in result["quality"]["reasons"]
    assert result["quality"]["confidence_score_0_1"] < 1.0


def test_calibration_v1_low_r2_triggers_reason():
    fps = 120.0
    scale_px_per_meter = 100.0
    track = _synthetic_track(
        vx=18.0,
        vy=9.0,
        fps=fps,
        scale_px_per_meter=scale_px_per_meter,
        frames=12,
        noise_px=30.0,
    )
    result = calibrate_v1(
        track,
        fps=fps,
        config=CalibrationV1Config(
            meters_per_pixel=1 / scale_px_per_meter,
            min_fit_r2=0.95,
        ),
    )
    assert "fit_r2_low" in result["quality"]["reasons"]
