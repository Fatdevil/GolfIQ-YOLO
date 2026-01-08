from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterable, List, Optional, Sequence, Tuple

import numpy as np

from cv_engine.metrics.kinematics import (
    clamp_velocity_outliers,
    windowed_velocity_samples,
)

Point = Tuple[float, float]


@dataclass(frozen=True)
class CalibrationConfig:
    enabled: bool = False
    meters_per_pixel: float | None = None
    reference_distance_m: float | None = None
    reference_points_px: tuple[Point, Point] | None = None
    camera_fps: float | None = None

    def resolve_meters_per_pixel(self) -> tuple[float | None, list[str]]:
        if not self.enabled:
            return None, ["disabled"]

        m_per_px = self.meters_per_pixel
        if m_per_px is None:
            if self.reference_distance_m is None or self.reference_points_px is None:
                return None, ["missing_reference"]
            (x1, y1), (x2, y2) = self.reference_points_px
            dist_px = math.hypot(x2 - x1, y2 - y1)
            if dist_px <= 0:
                return None, ["invalid_reference"]
            m_per_px = self.reference_distance_m / dist_px

        if m_per_px is None or m_per_px <= 0:
            return None, ["invalid_scale"]
        return float(m_per_px), []


@dataclass(frozen=True)
class LaunchWindowResult:
    start: int | None
    end: int | None
    confidence: float
    reason_codes: list[str] = field(default_factory=list)


def _step_distances(points: Sequence[Point]) -> List[float]:
    return [
        math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
        for i in range(1, len(points))
    ]


def detect_launch_window(ball_track_px: Sequence[Point]) -> LaunchWindowResult:
    if len(ball_track_px) < 2:
        return LaunchWindowResult(
            start=None, end=None, confidence=0.0, reason_codes=["insufficient_track"]
        )

    steps = _step_distances(ball_track_px)
    median_step = float(np.median(steps)) if steps else 0.0
    min_step = max(median_step * 0.5, 0.75)
    max_step = max(median_step * 6.0, min_step * 3.0, 5.0)

    moving_indices = [
        idx for idx, step in enumerate(steps, start=1) if min_step <= step <= max_step
    ]
    if not moving_indices:
        return LaunchWindowResult(
            start=None,
            end=None,
            confidence=0.1,
            reason_codes=["insufficient_motion"],
        )

    start_idx = max(moving_indices[0] - 1, 0)
    end_idx = moving_indices[-1]
    if end_idx <= start_idx:
        return LaunchWindowResult(
            start=None,
            end=None,
            confidence=0.2,
            reason_codes=["insufficient_window"],
        )

    coverage = len(moving_indices) / max(len(steps), 1)
    confidence = max(0.2, min(1.0, coverage))
    return LaunchWindowResult(
        start=start_idx,
        end=end_idx,
        confidence=confidence,
        reason_codes=[],
    )


def _dominant_axis(points: Sequence[Point]) -> Tuple[float, float]:
    if len(points) < 2:
        return 1.0, 0.0
    dx = points[-1][0] - points[0][0]
    dy = points[-1][1] - points[0][1]
    norm = math.hypot(dx, dy)
    if norm <= 1e-6:
        return 1.0, 0.0
    return dx / norm, dy / norm


def _fit_parabola(xs: np.ndarray, ys: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mask = np.ones_like(xs, dtype=bool)
    for _ in range(2):
        coeffs = np.polyfit(xs[mask], ys[mask], 2)
        fit = np.polyval(coeffs, xs[mask])
        residuals = np.abs(fit - ys[mask])
        if residuals.size == 0:
            break
        mad = float(np.median(np.abs(residuals - np.median(residuals))))
        threshold = max(mad * 4.0, float(np.percentile(residuals, 75)) * 1.5, 1.0)
        new_mask = np.abs(np.polyval(coeffs, xs) - ys) <= threshold
        if np.all(new_mask == mask):
            break
        if np.count_nonzero(new_mask) < 3:
            break
        mask = new_mask
    return coeffs, mask


def _launch_angle_deg(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    if len(xs) < 2:
        return None
    span = min(4, len(xs))
    x_slice = np.array(xs[:span])
    y_slice = np.array(ys[:span])
    if np.ptp(x_slice) <= 1e-6:
        return None
    slope, _ = np.polyfit(x_slice, y_slice, 1)
    return math.degrees(math.atan2(slope, 1.0))


def _speed_mps(
    positions_px: Iterable[Point],
    fps: float | None,
    m_per_px: float,
) -> float | None:
    if fps is None or fps <= 0:
        return None
    samples = windowed_velocity_samples(list(positions_px), fps=fps, m_per_px=m_per_px)
    if not samples:
        return None
    refined = clamp_velocity_outliers(samples)
    if not refined:
        return None
    magnitudes = [math.hypot(vx, vy) for vx, vy in refined]
    return float(sum(magnitudes) / len(magnitudes))


def calibrated_metrics(
    ball_track_px: Sequence[Point],
    config: CalibrationConfig,
) -> dict:
    meters_per_pixel, reasons = config.resolve_meters_per_pixel()
    if meters_per_pixel is None:
        return {
            "enabled": False,
            "quality": {"reasonCodes": reasons, "confidence": 0.0},
        }

    launch_window = detect_launch_window(ball_track_px)
    if launch_window.start is None or launch_window.end is None:
        reasons = reasons + launch_window.reason_codes
        return {
            "enabled": False,
            "metersPerPixel": meters_per_pixel,
            "launchWindow": {
                "start": launch_window.start,
                "end": launch_window.end,
                "confidence": round(launch_window.confidence, 3),
            },
            "quality": {"reasonCodes": reasons, "confidence": 0.0},
        }

    window_points = ball_track_px[launch_window.start : launch_window.end + 1]
    if len(window_points) < 3:
        return {
            "enabled": False,
            "metersPerPixel": meters_per_pixel,
            "launchWindow": {
                "start": launch_window.start,
                "end": launch_window.end,
                "confidence": round(launch_window.confidence, 3),
            },
            "quality": {
                "reasonCodes": reasons + ["insufficient_window"],
                "confidence": 0.0,
            },
        }

    axis_x, axis_y = _dominant_axis(window_points)
    origin_x, origin_y = window_points[0]
    xs = np.array(
        [
            (pt[0] - origin_x) * axis_x + (pt[1] - origin_y) * axis_y
            for pt in window_points
        ],
        dtype=float,
    )
    ys = np.array([-(pt[1] - origin_y) for pt in window_points], dtype=float)
    if np.ptp(xs) <= 1e-6:
        return {
            "enabled": False,
            "metersPerPixel": meters_per_pixel,
            "launchWindow": {
                "start": launch_window.start,
                "end": launch_window.end,
                "confidence": round(launch_window.confidence, 3),
            },
            "quality": {
                "reasonCodes": reasons + ["insufficient_motion"],
                "confidence": 0.0,
            },
        }

    sort_idx = np.argsort(xs)
    xs = xs[sort_idx]
    ys = ys[sort_idx]

    coeffs, inlier_mask = _fit_parabola(xs, ys)
    if np.count_nonzero(inlier_mask) < 3:
        return {
            "enabled": False,
            "metersPerPixel": meters_per_pixel,
            "launchWindow": {
                "start": launch_window.start,
                "end": launch_window.end,
                "confidence": round(launch_window.confidence, 3),
            },
            "quality": {"reasonCodes": reasons + ["fit_failed"], "confidence": 0.0},
        }

    fit_ys = np.polyval(coeffs, xs[inlier_mask])
    carry_px = float(xs[inlier_mask].max() - xs[inlier_mask].min())
    peak_height_px = max(float(fit_ys.max()), 0.0)
    launch_angle = _launch_angle_deg(xs[inlier_mask].tolist(), ys[inlier_mask].tolist())
    speed = _speed_mps(window_points, config.camera_fps, meters_per_pixel)

    reason_codes = list(reasons)
    if speed is None:
        reason_codes.append("missing_fps")

    confidence = launch_window.confidence * (
        np.count_nonzero(inlier_mask) / len(window_points)
    )
    confidence = max(0.1, min(1.0, confidence))

    result = {
        "enabled": True,
        "metersPerPixel": round(meters_per_pixel, 6),
        "carryM": round(carry_px * meters_per_pixel, 3),
        "peakHeightM": round(peak_height_px * meters_per_pixel, 3),
        "launchAngleDeg": round(launch_angle, 2) if launch_angle is not None else None,
        "launchWindow": {
            "start": launch_window.start,
            "end": launch_window.end,
            "confidence": round(launch_window.confidence, 3),
        },
        "quality": {
            "reasonCodes": reason_codes,
            "confidence": round(confidence, 3),
        },
    }
    if speed is not None:
        result["speedMps"] = round(speed, 3)
    return result
