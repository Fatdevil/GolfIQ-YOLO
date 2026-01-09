import math

from cv_engine.calibration.v1 import (
    CalibrationConfig,
    calibrated_metrics,
    detect_launch_window,
)


def test_calibration_scale_from_reference_points():
    config = CalibrationConfig(
        enabled=True,
        reference_distance_m=2.0,
        reference_points_px=((0.0, 0.0), (0.0, 200.0)),
    )
    meters_per_pixel, reasons = config.resolve_meters_per_pixel()
    assert reasons == []
    assert meters_per_pixel == 0.01


def test_detect_launch_window_finds_motion_segment():
    track = [(0.0, 0.0), (0.2, 0.1), (0.3, 0.0)]
    track += [(5.0 + i * 2.0, -1.0 - i * 0.5) for i in range(8)]
    result = detect_launch_window(track)
    assert result.start is not None
    assert result.end is not None
    assert result.start <= 3
    assert result.end >= result.start + 2


def test_calibrated_metrics_fit_parabola_with_outlier():
    points = []
    for i in range(12):
        x = i * 5.0
        y = 120.0 - 0.08 * (x - 30.0) ** 2
        points.append((x, y))
    points[5] = (points[5][0], points[5][1] + 40.0)

    config = CalibrationConfig(
        enabled=True,
        meters_per_pixel=0.01,
        camera_fps=120.0,
    )
    metrics = calibrated_metrics(points, config)
    assert metrics["enabled"] is True
    assert math.isclose(metrics["metersPerPixel"], 0.01, rel_tol=1e-6)
    assert metrics["carryM"] > 0.4
    assert metrics["peakHeightM"] > 0.0
    assert metrics.get("speedMps") is not None
