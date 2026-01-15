from __future__ import annotations

from dataclasses import dataclass, field
import os
from typing import Any, Iterable, Sequence

import numpy as np

FPS_WARN = 60.0
FPS_RECOMMENDED = 120.0
RESOLUTION_MIN_HEIGHT = 720
RESOLUTION_RECOMMENDED_HEIGHT = 1080

UNDEREXPOSED_LUMA = 60.0
OVEREXPOSED_LUMA = 200.0
EXPOSURE_BAD_FRAMES_PCT = 0.3

BLUR_LAPLACIAN_VAR_THRESHOLD = 200.0
BLUR_BAD_FRAMES_PCT = 0.3

SHAKE_DIFF_THRESHOLD = 12.0
SHAKE_BAD_FRAMES_PCT = 0.3


@dataclass(frozen=True)
class CaptureQualityIssue:
    code: str
    severity: str
    message: str
    details: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "details": dict(self.details),
        }


@dataclass
class CaptureQualityReport:
    score: int
    summary: dict[str, Any]
    issues: list[CaptureQualityIssue] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "summary": dict(self.summary),
            "issues": [issue.to_dict() for issue in self.issues],
            "recommendations": list(self.recommendations),
        }


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


def _frame_diff(prev: np.ndarray, curr: np.ndarray) -> float:
    return float(np.mean(np.abs(curr - prev)))


def _recommendations_for(codes: Sequence[str]) -> list[str]:
    mapping = {
        "LOW_FPS": "Enable slow-motion mode or increase capture FPS (120+ recommended).",
        "LOW_RESOLUTION": "Increase capture resolution (1080p+ recommended).",
        "UNDEREXPOSED": "Improve lighting or move to a brighter area.",
        "OVEREXPOSED": "Avoid harsh direct light; reduce exposure if possible.",
        "MOTION_BLUR": "Use a faster shutter or stabilize the camera to reduce blur.",
        "CAMERA_SHAKE": "Use a tripod or stabilize the phone to reduce shake.",
    }
    recommendations: list[str] = []
    for code in codes:
        recommendation = mapping.get(code)
        if recommendation and recommendation not in recommendations:
            recommendations.append(recommendation)
    return recommendations


def analyze_capture_quality(
    frames: Iterable[np.ndarray],
    *,
    fps: float | None = None,
) -> CaptureQualityReport:
    frames_list = list(frames)
    total_frames = len(frames_list)

    summary: dict[str, Any] = {
        "frames": total_frames,
        "fps": fps,
        "resolution": None,
    }

    if not frames_list:
        return CaptureQualityReport(score=0, summary=summary)

    height, width = frames_list[0].shape[:2]
    summary["resolution"] = {"width": int(width), "height": int(height)}

    issues: list[CaptureQualityIssue] = []

    fps_warn = _env_float("CAPTURE_QUALITY_FPS_WARN", FPS_WARN)
    fps_recommended = _env_float("CAPTURE_QUALITY_FPS_RECOMMENDED", FPS_RECOMMENDED)
    if fps is not None and fps < fps_warn:
        issues.append(
            CaptureQualityIssue(
                code="LOW_FPS",
                severity="warn",
                message="Frame rate is too low for reliable tracking.",
                details={
                    "fps": float(fps),
                    "warn_threshold": fps_warn,
                    "recommended": fps_recommended,
                },
            )
        )

    min_height = _env_int("CAPTURE_QUALITY_MIN_HEIGHT", RESOLUTION_MIN_HEIGHT)
    recommended_height = _env_int(
        "CAPTURE_QUALITY_RECOMMENDED_HEIGHT", RESOLUTION_RECOMMENDED_HEIGHT
    )
    if height < min_height:
        issues.append(
            CaptureQualityIssue(
                code="LOW_RESOLUTION",
                severity="warn",
                message="Resolution is below the recommended minimum.",
                details={
                    "height": int(height),
                    "min_height": int(min_height),
                    "recommended_height": int(recommended_height),
                },
            )
        )

    under_luma = _env_float("CAPTURE_QUALITY_UNDEREXPOSED_LUMA", UNDEREXPOSED_LUMA)
    over_luma = _env_float("CAPTURE_QUALITY_OVEREXPOSED_LUMA", OVEREXPOSED_LUMA)
    exposure_bad_pct = _env_float(
        "CAPTURE_QUALITY_EXPOSURE_BAD_PCT", EXPOSURE_BAD_FRAMES_PCT
    )

    luminance = np.array([_to_gray(frame).mean() for frame in frames_list])
    underexposed_pct = float(np.mean(luminance < under_luma))
    overexposed_pct = float(np.mean(luminance > over_luma))

    summary["underexposed_pct"] = round(underexposed_pct, 4)
    summary["overexposed_pct"] = round(overexposed_pct, 4)

    if underexposed_pct >= exposure_bad_pct:
        issues.append(
            CaptureQualityIssue(
                code="UNDEREXPOSED",
                severity="warn",
                message="Video appears too dark for reliable tracking.",
                details={
                    "underexposed_pct": round(underexposed_pct, 4),
                    "threshold": exposure_bad_pct,
                    "luma_threshold": under_luma,
                },
            )
        )

    if overexposed_pct >= exposure_bad_pct:
        issues.append(
            CaptureQualityIssue(
                code="OVEREXPOSED",
                severity="warn",
                message="Video appears too bright for reliable tracking.",
                details={
                    "overexposed_pct": round(overexposed_pct, 4),
                    "threshold": exposure_bad_pct,
                    "luma_threshold": over_luma,
                },
            )
        )

    blur_threshold = _env_float(
        "CAPTURE_QUALITY_BLUR_VAR_THRESHOLD", BLUR_LAPLACIAN_VAR_THRESHOLD
    )
    blur_bad_pct = _env_float("CAPTURE_QUALITY_BLUR_BAD_PCT", BLUR_BAD_FRAMES_PCT)
    blur_scores = np.array([
        _laplacian_variance(_to_gray(frame)) for frame in frames_list
    ])
    blurry_pct = float(np.mean(blur_scores < blur_threshold))
    summary["blurry_pct"] = round(blurry_pct, 4)
    summary["blur_variance_mean"] = round(float(blur_scores.mean()), 4)

    if blurry_pct >= blur_bad_pct:
        issues.append(
            CaptureQualityIssue(
                code="MOTION_BLUR",
                severity="warn",
                message="Video appears blurry; use a faster shutter or stabilize.",
                details={
                    "blurry_pct": round(blurry_pct, 4),
                    "threshold": blur_bad_pct,
                    "laplacian_var_threshold": blur_threshold,
                    "blur_variance_mean": round(float(blur_scores.mean()), 4),
                },
            )
        )

    shake_threshold = _env_float(
        "CAPTURE_QUALITY_SHAKE_DIFF_THRESHOLD", SHAKE_DIFF_THRESHOLD
    )
    shake_bad_pct = _env_float("CAPTURE_QUALITY_SHAKE_BAD_PCT", SHAKE_BAD_FRAMES_PCT)
    if total_frames >= 2:
        diffs = []
        prev_gray = _to_gray(frames_list[0])
        for frame in frames_list[1:]:
            curr_gray = _to_gray(frame)
            diffs.append(_frame_diff(prev_gray, curr_gray))
            prev_gray = curr_gray
        diffs_arr = np.array(diffs, dtype=np.float32)
        shaky_pct = float(np.mean(diffs_arr > shake_threshold))
        summary["shaky_pct"] = round(shaky_pct, 4)
        summary["shake_diff_mean"] = round(float(diffs_arr.mean()), 4)

        if shaky_pct >= shake_bad_pct:
            issues.append(
                CaptureQualityIssue(
                    code="CAMERA_SHAKE",
                    severity="warn",
                    message="Camera movement detected; stabilize for best results.",
                    details={
                        "shaky_pct": round(shaky_pct, 4),
                        "threshold": shake_bad_pct,
                        "diff_threshold": shake_threshold,
                        "diff_mean": round(float(diffs_arr.mean()), 4),
                    },
                )
            )
    else:
        summary["shaky_pct"] = 0.0

    penalties = {"info": 5, "warn": 15, "error": 30}
    score = 100 - sum(penalties.get(issue.severity, 0) for issue in issues)
    score = max(0, min(100, int(score)))

    codes = [issue.code for issue in issues]
    recommendations = _recommendations_for(codes)

    return CaptureQualityReport(
        score=score,
        summary=summary,
        issues=issues,
        recommendations=recommendations,
    )
