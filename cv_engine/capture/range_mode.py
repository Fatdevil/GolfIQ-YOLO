from __future__ import annotations

from dataclasses import dataclass, field
import os
from typing import Iterable, Sequence

import numpy as np

from cv_engine.calibration.types import TrackPoint


DEFAULT_SCORE_PENALTIES = {
    "fps_low": 0.2,
    "blur_high": 0.2,
    "exposure_too_dark": 0.15,
    "exposure_too_bright": 0.15,
    "framing_unstable": 0.15,
    "ball_lost_early": 0.2,
}


@dataclass(frozen=True)
class CaptureGuardrailsConfig:
    min_fps: float = 120.0
    recommended_fps: float = 240.0
    blur_variance_threshold: float = 200.0
    blur_bad_pct: float = 0.3
    dark_luma_threshold: float = 60.0
    bright_luma_threshold: float = 200.0
    exposure_bad_pct: float = 0.3
    min_track_length: int = 8
    max_first_detection_frame: int = 5
    edge_margin_pct: float = 0.1
    edge_bad_pct: float = 0.35
    score_penalties: dict[str, float] = field(
        default_factory=lambda: dict(DEFAULT_SCORE_PENALTIES)
    )

    @classmethod
    def from_env(cls) -> "CaptureGuardrailsConfig":
        return cls(
            min_fps=_env_float("CAPTURE_GUARDRAILS_MIN_FPS", cls.min_fps),
            recommended_fps=_env_float(
                "CAPTURE_GUARDRAILS_RECOMMENDED_FPS", cls.recommended_fps
            ),
            blur_variance_threshold=_env_float(
                "CAPTURE_GUARDRAILS_BLUR_VAR_THRESHOLD",
                cls.blur_variance_threshold,
            ),
            blur_bad_pct=_env_float(
                "CAPTURE_GUARDRAILS_BLUR_BAD_PCT", cls.blur_bad_pct
            ),
            dark_luma_threshold=_env_float(
                "CAPTURE_GUARDRAILS_DARK_LUMA", cls.dark_luma_threshold
            ),
            bright_luma_threshold=_env_float(
                "CAPTURE_GUARDRAILS_BRIGHT_LUMA", cls.bright_luma_threshold
            ),
            exposure_bad_pct=_env_float(
                "CAPTURE_GUARDRAILS_EXPOSURE_BAD_PCT", cls.exposure_bad_pct
            ),
            min_track_length=_env_int(
                "CAPTURE_GUARDRAILS_MIN_TRACK_LENGTH", cls.min_track_length
            ),
            max_first_detection_frame=_env_int(
                "CAPTURE_GUARDRAILS_MAX_FIRST_DETECTION_FRAME",
                cls.max_first_detection_frame,
            ),
            edge_margin_pct=_env_float(
                "CAPTURE_GUARDRAILS_EDGE_MARGIN_PCT", cls.edge_margin_pct
            ),
            edge_bad_pct=_env_float(
                "CAPTURE_GUARDRAILS_EDGE_BAD_PCT", cls.edge_bad_pct
            ),
        )


@dataclass(frozen=True)
class CaptureGuardrailsResult:
    capture_quality_score: float
    capture_quality_flags: list[str]
    capture_recommendations: list[str]
    diagnostics: dict[str, float | int | None] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        return {
            "score": round(float(self.capture_quality_score), 4),
            "flags": list(self.capture_quality_flags),
            "recommendations": list(self.capture_recommendations),
            "diagnostics": dict(self.diagnostics),
        }


class CaptureGuardrails:
    """Range Mode capture guardrails for fps, blur, exposure, and framing."""

    def __init__(self, config: CaptureGuardrailsConfig | None = None) -> None:
        self.config = config or CaptureGuardrailsConfig.from_env()

    def evaluate(
        self,
        *,
        frames: Iterable[np.ndarray] | None = None,
        fps: float | None = None,
        frame_timestamps: Sequence[float] | None = None,
        frame_size: tuple[int, int] | None = None,
        track_points: Sequence[TrackPoint] | None = None,
        brightness_stats: Sequence[float] | None = None,
        sharpness_stats: Sequence[float] | None = None,
    ) -> CaptureGuardrailsResult:
        frames_list = list(frames) if frames is not None else []
        if frame_size is None and frames_list:
            height, width = frames_list[0].shape[:2]
            frame_size = (int(width), int(height))

        effective_fps = _effective_fps(fps, frame_timestamps)
        brightness_values = _brightness_values(frames_list, brightness_stats)
        sharpness_values = _sharpness_values(frames_list, sharpness_stats)

        flags: list[str] = []
        diagnostics: dict[str, float | int | None] = {
            "effective_fps": None if effective_fps is None else round(effective_fps, 3),
            "brightness_mean": None,
            "brightness_dark_pct": None,
            "brightness_bright_pct": None,
            "sharpness_mean": None,
            "sharpness_blur_pct": None,
            "track_length": None,
            "track_edge_pct": None,
        }

        if effective_fps is not None and effective_fps < self.config.min_fps:
            flags.append("fps_low")

        if brightness_values.size:
            brightness_mean = float(brightness_values.mean())
            dark_pct = float(
                np.mean(brightness_values < self.config.dark_luma_threshold)
            )
            bright_pct = float(
                np.mean(brightness_values > self.config.bright_luma_threshold)
            )
            diagnostics.update(
                {
                    "brightness_mean": round(brightness_mean, 3),
                    "brightness_dark_pct": round(dark_pct, 4),
                    "brightness_bright_pct": round(bright_pct, 4),
                }
            )
            if dark_pct >= self.config.exposure_bad_pct:
                flags.append("exposure_too_dark")
            if bright_pct >= self.config.exposure_bad_pct:
                flags.append("exposure_too_bright")

        if sharpness_values.size:
            sharpness_mean = float(sharpness_values.mean())
            blur_pct = float(
                np.mean(sharpness_values < self.config.blur_variance_threshold)
            )
            diagnostics.update(
                {
                    "sharpness_mean": round(sharpness_mean, 3),
                    "sharpness_blur_pct": round(blur_pct, 4),
                }
            )
            if blur_pct >= self.config.blur_bad_pct:
                flags.append("blur_high")

        if track_points is not None and len(track_points) > 0:
            flags.extend(
                _framing_flags(
                    track_points,
                    frame_size=frame_size,
                    config=self.config,
                    diagnostics=diagnostics,
                )
            )

        recommendations = _recommendations_for(flags, self.config)
        score = _score_from_flags(flags, self.config)

        return CaptureGuardrailsResult(
            capture_quality_score=score,
            capture_quality_flags=flags,
            capture_recommendations=recommendations,
            diagnostics=diagnostics,
        )


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _effective_fps(
    fps: float | None, frame_timestamps: Sequence[float] | None
) -> float | None:
    if frame_timestamps and len(frame_timestamps) >= 2:
        deltas = np.diff(np.array(frame_timestamps, dtype=np.float64))
        deltas = deltas[deltas > 0]
        if deltas.size:
            return float(1.0 / float(deltas.mean()))
    return fps


def _to_gray(frame: np.ndarray) -> np.ndarray:
    if frame.ndim == 2:
        return frame.astype(np.float32)
    if frame.shape[-1] >= 3:
        frame_float = frame.astype(np.float32)
        r = frame_float[..., 0]
        g = frame_float[..., 1]
        b = frame_float[..., 2]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    return frame.astype(np.float32)


def _laplacian_variance(gray: np.ndarray) -> float:
    padded = np.pad(gray, 1, mode="edge")
    center = padded[1:-1, 1:-1]
    laplacian = (
        padded[1:-1, :-2]
        + padded[1:-1, 2:]
        + padded[:-2, 1:-1]
        + padded[2:, 1:-1]
        - 4.0 * center
    )
    return float(laplacian.var())


def _brightness_values(
    frames: Sequence[np.ndarray],
    brightness_stats: Sequence[float] | None,
) -> np.ndarray:
    if brightness_stats is not None:
        return np.array(list(brightness_stats), dtype=np.float32)
    if not frames:
        return np.array([], dtype=np.float32)
    return np.array([_to_gray(frame).mean() for frame in frames], dtype=np.float32)


def _sharpness_values(
    frames: Sequence[np.ndarray],
    sharpness_stats: Sequence[float] | None,
) -> np.ndarray:
    if sharpness_stats is not None:
        return np.array(list(sharpness_stats), dtype=np.float32)
    if not frames:
        return np.array([], dtype=np.float32)
    return np.array(
        [_laplacian_variance(_to_gray(frame)) for frame in frames],
        dtype=np.float32,
    )


def _framing_flags(
    track_points: Sequence[TrackPoint],
    *,
    frame_size: tuple[int, int] | None,
    config: CaptureGuardrailsConfig,
    diagnostics: dict[str, float | int | None],
) -> list[str]:
    flags: list[str] = []
    track_length = len(track_points)
    diagnostics["track_length"] = track_length

    if track_length < config.min_track_length:
        flags.append("ball_lost_early")
    if track_points[0].frame_idx > config.max_first_detection_frame:
        flags.append("ball_lost_early")

    if frame_size is None:
        return flags

    width, height = frame_size
    margin = min(width, height) * config.edge_margin_pct
    near_edge = [
        pt
        for pt in track_points
        if pt.x_px <= margin
        or pt.x_px >= width - margin
        or pt.y_px <= margin
        or pt.y_px >= height - margin
    ]
    edge_pct = float(len(near_edge) / track_length) if track_length else 0.0
    diagnostics["track_edge_pct"] = round(edge_pct, 4)
    if edge_pct >= config.edge_bad_pct:
        flags.append("framing_unstable")
    return flags


def _recommendations_for(
    flags: Sequence[str], config: CaptureGuardrailsConfig
) -> list[str]:
    mapping = {
        "fps_low": ("Record in slow-motion mode (120+ FPS minimum, 240 FPS ideal)."),
        "blur_high": "Use faster shutter/lock exposure and stabilize the phone.",
        "exposure_too_dark": "Increase lighting or move to a brighter area.",
        "exposure_too_bright": "Reduce exposure or avoid harsh direct light.",
        "framing_unstable": (
            "Keep the ball centered with extra margin so it stays in frame."
        ),
        "ball_lost_early": "Start recording earlier and keep the ball visible longer.",
    }
    recommendations: list[str] = []
    for flag in flags:
        recommendation = mapping.get(flag)
        if recommendation and recommendation not in recommendations:
            recommendations.append(recommendation)
    return recommendations


def _score_from_flags(flags: Sequence[str], config: CaptureGuardrailsConfig) -> float:
    score = 1.0
    for flag in flags:
        score -= config.score_penalties.get(flag, 0.1)
    return max(0.0, min(1.0, score))
