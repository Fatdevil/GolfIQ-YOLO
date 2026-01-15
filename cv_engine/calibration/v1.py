from __future__ import annotations

from typing import Sequence, Tuple

from cv_engine.calibration.launch_window import (
    LaunchWindowConfig,
    detect_launch_window as detect_launch_window_v1,
)
from cv_engine.calibration.scale import points_px_to_meters, resolve_scale
from cv_engine.calibration.trajectory_fit import (
    TrajectoryFitConfig,
    fit_trajectory,
)
from cv_engine.calibration.types import (
    CalibrationConfig,
    LaunchWindowResult,
    TrackPoint,
    to_track_points,
)

Point = Tuple[float, float]


def detect_launch_window(
    ball_track_px: Sequence[Point] | Sequence[TrackPoint],
) -> LaunchWindowResult:
    points = to_track_points(ball_track_px)
    return detect_launch_window_v1(points)


def _fps_from_config(config: CalibrationConfig) -> float | None:
    return config.camera_fps if config.camera_fps is not None else config.fps


def calibrated_metrics(
    ball_track_px: Sequence[Point] | Sequence[TrackPoint],
    config: CalibrationConfig,
) -> dict:
    if not config.enabled:
        return {
            "enabled": False,
            "calibrated": False,
            "quality": {"reasonCodes": ["disabled"], "confidence": 0.0},
        }
    points = to_track_points(ball_track_px)
    # Normalize ordering for launch-window detection and trajectory fitting.
    ordered_points = sorted(points, key=lambda pt: pt.frame_idx)
    scale_result = resolve_scale(config)
    meters_per_pixel = scale_result.meters_per_pixel
    scale_px_per_meter = scale_result.scale_px_per_meter
    reasons = list(scale_result.reason_codes)

    launch_window = detect_launch_window_v1(ordered_points, config=LaunchWindowConfig())
    if launch_window.start_index is None or launch_window.end_index is None:
        reasons = reasons + launch_window.reason_codes
        return {
            "enabled": False,
            "calibrated": False,
            "metersPerPixel": meters_per_pixel,
            "scalePxPerMeter": scale_px_per_meter,
            "launchWindow": {
                "start": launch_window.start_frame,
                "end": launch_window.end_frame,
                "length": launch_window.length,
                "confidence": round(launch_window.confidence, 3),
            },
            "quality": {"reasonCodes": reasons, "confidence": 0.0},
        }

    window_points = ordered_points[
        launch_window.start_index : launch_window.end_index + 1
    ]
    fit = fit_trajectory(
        window_points,
        fps=_fps_from_config(config),
        meters_per_pixel=meters_per_pixel,
        config=TrajectoryFitConfig(),
    )

    reason_codes = list(reasons)
    reason_codes.extend(fit.reason_codes)
    quality_confidence = (
        launch_window.confidence * (fit.fit_r2 or 0.0) if fit.calibrated else 0.0
    )

    payload = {
        "enabled": fit.calibrated,
        "calibrated": fit.calibrated,
        "metersPerPixel": meters_per_pixel,
        "scalePxPerMeter": scale_px_per_meter,
        "launchWindow": {
            "start": launch_window.start_frame,
            "end": launch_window.end_frame,
            "length": launch_window.length,
            "confidence": round(launch_window.confidence, 3),
        },
        "quality": {
            "reasonCodes": reason_codes,
            "confidence": round(quality_confidence, 3),
        },
    }

    if fit.pixel_speed is not None:
        payload["pixelKinematics"] = {
            "speedPxPerS": round(fit.pixel_speed, 3),
            "launchAngleDeg": (
                round(fit.pixel_angle_deg, 2)
                if fit.pixel_angle_deg is not None
                else None
            ),
        }

    if fit.calibrated:
        payload.update(
            {
                "carryM": round(fit.carry_m or 0.0, 3),
                "peakHeightM": round(fit.peak_height_m or 0.0, 3),
                "launchAngleDeg": (
                    round(fit.launch_angle_deg, 2)
                    if fit.launch_angle_deg is not None
                    else None
                ),
                "fit": {
                    "r2": round(fit.fit_r2 or 0.0, 3),
                    "rmse": round(fit.fit_rmse or 0.0, 3),
                    "vxMps": round(fit.vx_mps or 0.0, 3),
                    "vyMps": round(fit.vy_mps or 0.0, 3),
                },
            }
        )
        if fit.speed_mps is not None:
            payload["speedMps"] = round(fit.speed_mps, 3)
        if fit.speed_mph is not None:
            payload["speedMph"] = round(fit.speed_mph, 2)
        if meters_per_pixel is not None:
            track_points = [pt.as_point() for pt in ordered_points]
            payload["ballTrackM"] = points_px_to_meters(
                track_points, meters_per_pixel=meters_per_pixel
            )

    if not fit.calibrated and "missing_scale" in reason_codes:
        reason_codes.append("calibration_missing")
    if fit.calibrated and "fit_low_confidence" in reason_codes:
        reason_codes.append("calibration_unstable")

    payload["quality"]["reasonCodes"] = list(dict.fromkeys(reason_codes))
    return payload
