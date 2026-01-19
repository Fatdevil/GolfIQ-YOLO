from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np

from cv_engine.calibration.types import TrackPoint


@dataclass(frozen=True)
class CalibrationV1Config:
    """Configuration for calibration_v1 helpers."""

    meters_per_pixel: float | None = None
    reference_distance_m: float | None = None
    reference_pixels: float | None = None
    reference_points_px: tuple[tuple[float, float], tuple[float, float]] | None = None
    expected_ball_diameter_m: float | None = None
    observed_ball_diameter_px: float | None = None
    fallback_scale_m_per_px: float = 0.0025
    min_points: int = 6
    min_motion_px_per_frame: float = 1.0
    min_sustain_frames: int = 3
    max_window_points: int = 20
    max_gap_frames: int = 2
    max_carry_m: float = 400.0
    min_confidence_score: float = 0.5
    min_fit_r2: float = 0.8
    max_fit_rmse_m: float = 0.1
    fit_metric_override: str | None = None


@dataclass(frozen=True)
class LaunchWindowV1:
    start_index: int | None
    end_index: int | None
    start_frame: int | None
    end_frame: int | None
    n_points: int
    reasons: list[str]


@dataclass(frozen=True)
class ScaleV1Result:
    meters_per_pixel: float
    reasons: list[str]
    used_fallback: bool = False


@dataclass(frozen=True)
class FitV1Result:
    azimuth_deg: float | None
    launch_angle_deg: float | None
    carry_m_est: float | None
    apex_m_est: float | None
    fit_r2: float | None
    fit_rmse: float | None
    r2_or_residual: float | None
    fit_metric: str | None
    n_fit_points: int


def _sorted_points(
    track: Sequence[TrackPoint] | Iterable[TrackPoint],
) -> list[TrackPoint]:
    points = list(track)
    return sorted(points, key=lambda pt: pt.frame_idx)


def _resolve_scale(config: CalibrationV1Config) -> ScaleV1Result:
    reasons: list[str] = []
    if config.meters_per_pixel is not None:
        reasons.append("scale_provided")
        return ScaleV1Result(
            meters_per_pixel=config.meters_per_pixel,
            reasons=reasons,
            used_fallback=False,
        )
    if config.reference_distance_m is not None:
        pixels = config.reference_pixels
        if pixels is None and config.reference_points_px is not None:
            (x1, y1), (x2, y2) = config.reference_points_px
            pixels = float(np.hypot(x2 - x1, y2 - y1))
        if pixels and pixels > 0:
            reasons.append("scale_reference_points")
            return ScaleV1Result(
                meters_per_pixel=config.reference_distance_m / pixels,
                reasons=reasons,
                used_fallback=False,
            )
    if config.expected_ball_diameter_m is not None and config.observed_ball_diameter_px:
        reasons.append("scale_ball_diameter")
        return ScaleV1Result(
            meters_per_pixel=config.expected_ball_diameter_m
            / config.observed_ball_diameter_px,
            reasons=reasons,
            used_fallback=False,
        )
    reasons.append("fallback_scale")
    return ScaleV1Result(
        meters_per_pixel=config.fallback_scale_m_per_px,
        reasons=reasons,
        used_fallback=True,
    )


def _detect_launch_window(
    track: Sequence[TrackPoint], config: CalibrationV1Config
) -> LaunchWindowV1:
    points = _sorted_points(track)
    if len(points) < 2:
        return LaunchWindowV1(
            start_index=None,
            end_index=None,
            start_frame=None,
            end_frame=None,
            n_points=0,
            reasons=["insufficient_points"],
        )

    speeds = []
    gaps = []
    for idx in range(len(points) - 1):
        dt_frames = points[idx + 1].frame_idx - points[idx].frame_idx
        if dt_frames <= 0:
            speeds.append(0.0)
            gaps.append(0)
            continue
        dx = points[idx + 1].x_px - points[idx].x_px
        dy = points[idx + 1].y_px - points[idx].y_px
        speeds.append(float(np.hypot(dx, dy) / dt_frames))
        gaps.append(dt_frames)

    start_index = None
    for idx in range(len(speeds)):
        sustained = True
        for offset in range(config.min_sustain_frames):
            step_idx = idx + offset
            if step_idx >= len(speeds):
                sustained = False
                break
            if gaps[step_idx] > config.max_gap_frames:
                sustained = False
                break
            if speeds[step_idx] < config.min_motion_px_per_frame:
                sustained = False
                break
        if sustained:
            start_index = idx
            break

    if start_index is None:
        return LaunchWindowV1(
            start_index=None,
            end_index=None,
            start_frame=None,
            end_frame=None,
            n_points=0,
            reasons=["launch_window_not_found"],
        )

    end_index = start_index
    for idx in range(start_index, len(points) - 1):
        if points[idx + 1].frame_idx - points[idx].frame_idx > config.max_gap_frames:
            break
        end_index = idx + 1
        if end_index - start_index + 1 >= config.max_window_points:
            break

    n_points = end_index - start_index + 1
    if n_points < config.min_points:
        return LaunchWindowV1(
            start_index=start_index,
            end_index=end_index,
            start_frame=points[start_index].frame_idx,
            end_frame=points[end_index].frame_idx,
            n_points=n_points,
            reasons=["launch_window_too_short"],
        )

    return LaunchWindowV1(
        start_index=start_index,
        end_index=end_index,
        start_frame=points[start_index].frame_idx,
        end_frame=points[end_index].frame_idx,
        n_points=n_points,
        reasons=[],
    )


def _fit_trajectory(
    window_points: Sequence[TrackPoint],
    fps: float,
    meters_per_pixel: float,
    config: CalibrationV1Config,
) -> FitV1Result:
    if fps <= 0:
        return FitV1Result(
            azimuth_deg=None,
            launch_angle_deg=None,
            carry_m_est=None,
            apex_m_est=None,
            fit_r2=None,
            fit_rmse=None,
            r2_or_residual=None,
            fit_metric=None,
            n_fit_points=len(window_points),
        )

    points = _sorted_points(window_points)
    start = points[0]
    t = np.array([(pt.frame_idx - start.frame_idx) / fps for pt in points])
    x_m = np.array([(pt.x_px - start.x_px) * meters_per_pixel for pt in points])
    y_m = np.array([-(pt.y_px - start.y_px) * meters_per_pixel for pt in points])

    x_design = np.column_stack([t, np.ones_like(t)])
    vx, x0 = np.linalg.lstsq(x_design, x_m, rcond=None)[0]

    y_design = np.column_stack([t * t, t, np.ones_like(t)])
    a, b, c = np.linalg.lstsq(y_design, y_m, rcond=None)[0]
    y_pred = y_design @ np.array([a, b, c])
    residuals = y_m - y_pred
    ss_res = float(np.sum(residuals**2))
    ss_tot = float(np.sum((y_m - float(np.mean(y_m))) ** 2))
    r2 = None if ss_tot == 0 else 1 - ss_res / ss_tot
    rmse = float(np.sqrt(ss_res / len(y_m))) if len(y_m) else None
    metric = "r2" if r2 is not None else "rmse"
    if config.fit_metric_override in {"r2", "rmse"}:
        metric = config.fit_metric_override

    launch_angle_deg = float(np.degrees(np.arctan2(b, vx))) if vx != 0 else None
    azimuth_deg = 0.0 if vx >= 0 else 180.0

    carry = None
    apex = None
    if abs(a) > 1e-6 or abs(b) > 1e-6:
        if abs(a) < 1e-6:
            t_flight = -c / b if b != 0 else None
        else:
            roots = np.roots([a, b, c])
            positive_roots = [
                float(rt.real) for rt in roots if rt.real > 0 and abs(rt.imag) < 1e-6
            ]
            t_flight = max(positive_roots) if positive_roots else None
        if t_flight is not None and t_flight > 0:
            carry = float(vx * t_flight)
            if carry < 0:
                carry = None
            elif carry > config.max_carry_m:
                carry = config.max_carry_m
        if a < 0:
            t_peak = -b / (2 * a)
            if t_peak > 0:
                apex_val = a * t_peak * t_peak + b * t_peak + c
                if apex_val >= 0:
                    apex = float(apex_val)

    return FitV1Result(
        azimuth_deg=azimuth_deg,
        launch_angle_deg=launch_angle_deg,
        carry_m_est=carry,
        apex_m_est=apex,
        fit_r2=r2,
        fit_rmse=rmse,
        # TODO: keep legacy field until downstream consumers migrate.
        r2_or_residual=r2 if metric == "r2" else rmse,
        fit_metric=metric,
        n_fit_points=len(points),
    )


def calibrate_v1(
    track: Sequence[TrackPoint],
    fps: float,
    config: CalibrationV1Config | None = None,
) -> dict:
    """Calibrate a stabilized ball track into metric launch estimates.

    Args:
        track: Ordered list of TrackPoint values.
        fps: Capture frames per second.
        config: Optional calibration settings.

    Returns:
        Dict payload suitable for JSON serialization.
    """

    cfg = config or CalibrationV1Config()
    points = _sorted_points(track)
    if len(points) < cfg.min_points:
        return {
            "status": "insufficient_data",
            "used_m_per_px": cfg.fallback_scale_m_per_px,
            "launch_window": {"start_frame": None, "end_frame": None, "n_points": 0},
            "fit": {
                "azimuth_deg": None,
                "launch_angle_deg": None,
                "carry_m_est": None,
                "apex_m_est": None,
                "r2_or_residual": None,
                "fit_metric": None,
                "fit_r2": None,
                "fit_rmse": None,
                "n_fit_points": 0,
            },
            "quality": {
                "confidence_score_0_1": 0.0,
                "reasons": ["insufficient_points"],
            },
        }

    launch_window = _detect_launch_window(points, cfg)
    if launch_window.start_index is None or launch_window.end_index is None:
        return {
            "status": "insufficient_data",
            "used_m_per_px": cfg.fallback_scale_m_per_px,
            "launch_window": {
                "start_frame": launch_window.start_frame,
                "end_frame": launch_window.end_frame,
                "n_points": launch_window.n_points,
            },
            "fit": {
                "azimuth_deg": None,
                "launch_angle_deg": None,
                "carry_m_est": None,
                "apex_m_est": None,
                "r2_or_residual": None,
                "fit_metric": None,
                "fit_r2": None,
                "fit_rmse": None,
                "n_fit_points": 0,
            },
            "quality": {
                "confidence_score_0_1": 0.0,
                "reasons": launch_window.reasons,
            },
        }

    scale = _resolve_scale(cfg)
    window_points = points[launch_window.start_index : launch_window.end_index + 1]
    fit = _fit_trajectory(
        window_points, fps=fps, meters_per_pixel=scale.meters_per_pixel, config=cfg
    )

    reasons = []
    reasons.extend(launch_window.reasons)
    reasons.extend(scale.reasons)

    max_gap = 0
    for idx in range(len(window_points) - 1):
        gap = window_points[idx + 1].frame_idx - window_points[idx].frame_idx
        if gap > max_gap:
            max_gap = gap

    confidences = [pt.confidence for pt in window_points if pt.confidence is not None]
    mean_confidence = float(np.mean(confidences)) if confidences else None

    confidence_score = 1.0
    if fit.n_fit_points < cfg.min_points:
        confidence_score = 0.0
        reasons.append("insufficient_points")
    if scale.used_fallback:
        confidence_score -= 0.35
        reasons.append("fallback_scale")
    if mean_confidence is not None and mean_confidence < 0.6:
        confidence_score -= 0.2
        reasons.append("low_track_confidence")
    if max_gap > cfg.max_gap_frames:
        confidence_score -= 0.2
        reasons.append("gaps_in_window")
    if fit.fit_metric == "r2":
        if fit.fit_r2 is not None and fit.fit_r2 < cfg.min_fit_r2:
            confidence_score -= 0.3
            reasons.append("fit_r2_low")
    elif fit.fit_metric == "rmse":
        # RMSE is lower-is-better, unlike R² which is higher-is-better.
        if fit.fit_rmse is not None and fit.fit_rmse > cfg.max_fit_rmse_m:
            confidence_score -= 0.3
            reasons.append("fit_rmse_high")
    if fit.n_fit_points < cfg.min_points + 2:
        confidence_score -= 0.1
        reasons.append("few_points")

    confidence_score = max(0.0, min(1.0, confidence_score))
    status = "ok"
    if fit.n_fit_points < cfg.min_points or fps <= 0:
        status = "insufficient_data"
    elif confidence_score < cfg.min_confidence_score or scale.used_fallback:
        status = "low_confidence"

    return {
        "status": status,
        "used_m_per_px": scale.meters_per_pixel,
        "launch_window": {
            "start_frame": launch_window.start_frame,
            "end_frame": launch_window.end_frame,
            "n_points": launch_window.n_points,
        },
        "fit": {
            "azimuth_deg": fit.azimuth_deg,
            "launch_angle_deg": fit.launch_angle_deg,
            "carry_m_est": fit.carry_m_est,
            "apex_m_est": fit.apex_m_est,
            "r2_or_residual": fit.r2_or_residual,
            "fit_metric": fit.fit_metric,
            "fit_r2": fit.fit_r2,
            "fit_rmse": fit.fit_rmse,
            "n_fit_points": fit.n_fit_points,
        },
        "quality": {
            "confidence_score_0_1": confidence_score,
            "reasons": list(dict.fromkeys(reasons)),
        },
    }
