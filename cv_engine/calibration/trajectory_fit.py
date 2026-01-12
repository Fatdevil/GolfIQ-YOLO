from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

import numpy as np

from .types import TrackPoint, TrajectoryFitResult


@dataclass(frozen=True)
class TrajectoryFitConfig:
    min_points: int = 4
    min_time_span_s: float = 0.02
    min_r2: float = 0.7


def _fit_line(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    slope, intercept = np.polyfit(x, y, 1)
    return float(slope), float(intercept)


def _fit_parabola(x: np.ndarray, y: np.ndarray) -> tuple[float, float, float]:
    a, b, c = np.polyfit(x, y, 2)
    return float(a), float(b), float(c)


def _r2_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    if y_true.size == 0:
        return 0.0
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
    if ss_tot <= 1e-9:
        return 0.0
    return 1.0 - ss_res / ss_tot


def _pixel_kinematics(
    points: Sequence[TrackPoint],
    fps: float,
) -> tuple[float | None, float | None]:
    if len(points) < 2 or fps <= 0:
        return None, None
    start = points[0]
    end = points[-1]
    dt = (end.frame_idx - start.frame_idx) / fps
    if dt <= 0:
        return None, None
    vx = (end.x_px - start.x_px) / dt
    vy = (start.y_px - end.y_px) / dt
    speed = math.hypot(vx, vy)
    angle = math.degrees(math.atan2(vy, vx)) if speed else None
    return speed, angle


def fit_trajectory(
    points: Sequence[TrackPoint],
    *,
    fps: float | None,
    meters_per_pixel: float | None,
    config: TrajectoryFitConfig | None = None,
) -> TrajectoryFitResult:
    config = config or TrajectoryFitConfig()
    reason_codes: list[str] = []
    if len(points) < config.min_points:
        return TrajectoryFitResult(
            calibrated=False,
            reason_codes=["launch_window_too_short"],
        )
    if fps is None or fps <= 0:
        return TrajectoryFitResult(
            calibrated=False,
            reason_codes=["missing_fps"],
        )

    pixel_speed, pixel_angle = _pixel_kinematics(points, fps)

    if meters_per_pixel is None or meters_per_pixel <= 0:
        return TrajectoryFitResult(
            calibrated=False,
            reason_codes=["missing_scale"],
            pixel_speed=pixel_speed,
            pixel_angle_deg=pixel_angle,
        )

    times = np.array(
        [(pt.frame_idx - points[0].frame_idx) / fps for pt in points], dtype=float
    )
    if times.size < config.min_points or np.ptp(times) < config.min_time_span_s:
        return TrajectoryFitResult(
            calibrated=False,
            reason_codes=["insufficient_motion"],
            pixel_speed=pixel_speed,
            pixel_angle_deg=pixel_angle,
        )

    origin_x = points[0].x_px
    origin_y = points[0].y_px
    xs = np.array([(pt.x_px - origin_x) * meters_per_pixel for pt in points])
    ys = np.array([-(pt.y_px - origin_y) * meters_per_pixel for pt in points])

    vx, x_intercept = _fit_line(times, xs)
    a, b, c = _fit_parabola(times, ys)
    vy = b

    x_pred = vx * times + x_intercept
    y_pred = a * times**2 + b * times + c

    r2_x = _r2_score(xs, x_pred)
    r2_y = _r2_score(ys, y_pred)
    fit_r2 = float((r2_x + r2_y) / 2.0)
    fit_rmse = float(np.sqrt(np.mean((ys - y_pred) ** 2)))

    speed_mps = math.hypot(vx, vy)
    launch_angle_deg = math.degrees(math.atan2(vy, vx)) if speed_mps > 0 else None
    speed_mph = speed_mps * 2.23694 if speed_mps > 0 else None

    g = 9.81
    carry_m = max(vx * (2 * vy / g), 0.0) if vy > 0 else 0.0
    peak_height_m = float(max(y_pred.max(), 0.0))

    if fit_r2 < config.min_r2:
        reason_codes.append("fit_low_confidence")

    return TrajectoryFitResult(
        calibrated=True,
        vx_mps=vx,
        vy_mps=vy,
        speed_mps=speed_mps,
        speed_mph=speed_mph,
        launch_angle_deg=launch_angle_deg,
        carry_m=carry_m,
        peak_height_m=peak_height_m,
        fit_r2=fit_r2,
        fit_rmse=fit_rmse,
        reason_codes=reason_codes,
        pixel_speed=pixel_speed,
        pixel_angle_deg=pixel_angle,
    )
