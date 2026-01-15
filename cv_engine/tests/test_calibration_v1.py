import math
import random

from cv_engine.calibration.launch_window import LaunchWindowConfig, detect_launch_window
from cv_engine.calibration.scale import points_px_to_meters, resolve_scale
from cv_engine.calibration.trajectory_fit import fit_trajectory
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
