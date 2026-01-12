from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


DEFAULT_THRESHOLDS = {
    "track_breaks_warn": 1,
    "track_breaks_error": 3,
    "max_gap_frames_warn": 4,
    "max_gap_frames_error": 8,
    "avg_confidence_warn": 0.35,
    "avg_confidence_error": 0.2,
    "id_switches_warn": 1,
    "id_switches_error": 3,
    "tracking_gap_ratio_warn": 0.18,
    "tracking_gap_ratio_error": 0.32,
    "tracking_jitter_warn_px": 6.0,
    "tracking_jitter_error_px": 12.0,
    "missing_ball_frames_ratio_warn": 0.2,
    "missing_ball_frames_ratio_error": 0.4,
    "min_ball_points": 6,
    "calibration_confidence_warn": 0.6,
    "calibration_confidence_error": 0.4,
    "launch_window_min": 4,
    "fps_warn": 60.0,
    "fps_error": 45.0,
    "fps_mismatch_warn": 5.0,
    "fps_mismatch_error": 12.0,
}

SEVERITY_ORDER = {"error": 0, "warn": 1, "info": 2}


@dataclass(frozen=True)
class ExplainIssue:
    code: str
    severity: str
    message: str
    details: Mapping[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
        }
        if self.details:
            payload["details"] = dict(self.details)
        return payload


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _severity_for(value: float, warn: float, error: float) -> str | None:
    if value >= error:
        return "error"
    if value >= warn:
        return "warn"
    return None


def _severity_for_low(value: float, warn: float, error: float) -> str | None:
    if value <= error:
        return "error"
    if value <= warn:
        return "warn"
    return None


def build_explain_result(
    *,
    tracking_metrics: Mapping[str, float | int] | None = None,
    calibration_info: Mapping[str, Any] | None = None,
    run_stats: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    tracking_metrics = tracking_metrics or {}
    calibration_info = calibration_info or {}
    run_stats = run_stats or {}

    issues: list[ExplainIssue] = []
    penalty = 0.0

    def add_issue(
        code: str,
        severity: str,
        message: str,
        *,
        details: Mapping[str, Any] | None = None,
        penalty_amount: float = 0.0,
    ) -> None:
        nonlocal penalty
        issues.append(
            ExplainIssue(
                code=code,
                severity=severity,
                message=message,
                details=details,
            )
        )
        penalty += penalty_amount

    track_breaks = int(tracking_metrics.get("track_breaks", 0) or 0)
    if severity := _severity_for(
        track_breaks,
        DEFAULT_THRESHOLDS["track_breaks_warn"],
        DEFAULT_THRESHOLDS["track_breaks_error"],
    ):
        add_issue(
            "track_breaks_high",
            severity,
            "Tracking breaks were detected.",
            details={
                "track_breaks": track_breaks,
                "warn_at": DEFAULT_THRESHOLDS["track_breaks_warn"],
                "error_at": DEFAULT_THRESHOLDS["track_breaks_error"],
            },
            penalty_amount=0.35 if severity == "error" else 0.2,
        )

    max_gap_frames = int(tracking_metrics.get("max_gap_frames", 0) or 0)
    if severity := _severity_for(
        max_gap_frames,
        DEFAULT_THRESHOLDS["max_gap_frames_warn"],
        DEFAULT_THRESHOLDS["max_gap_frames_error"],
    ):
        add_issue(
            "track_gaps_long",
            severity,
            "Extended gaps in ball tracking were found.",
            details={
                "max_gap_frames": max_gap_frames,
                "warn_at": DEFAULT_THRESHOLDS["max_gap_frames_warn"],
                "error_at": DEFAULT_THRESHOLDS["max_gap_frames_error"],
            },
            penalty_amount=0.2 if severity == "error" else 0.1,
        )

    if "gap_ratio" in tracking_metrics:
        gap_ratio = float(tracking_metrics.get("gap_ratio", 0.0) or 0.0)
        if severity := _severity_for(
            gap_ratio,
            DEFAULT_THRESHOLDS["tracking_gap_ratio_warn"],
            DEFAULT_THRESHOLDS["tracking_gap_ratio_error"],
        ):
            add_issue(
                "ball_track_gappy",
                severity,
                "Ball tracking contains frequent gaps.",
                details={
                    "gap_ratio": round(gap_ratio, 3),
                    "warn_at": DEFAULT_THRESHOLDS["tracking_gap_ratio_warn"],
                    "error_at": DEFAULT_THRESHOLDS["tracking_gap_ratio_error"],
                },
                penalty_amount=0.2 if severity == "error" else 0.1,
            )

    if "jitter_px" in tracking_metrics:
        jitter_px = float(tracking_metrics.get("jitter_px", 0.0) or 0.0)
        if severity := _severity_for(
            jitter_px,
            DEFAULT_THRESHOLDS["tracking_jitter_warn_px"],
            DEFAULT_THRESHOLDS["tracking_jitter_error_px"],
        ):
            add_issue(
                "ball_track_unstable",
                severity,
                "Ball tracking jitter exceeded stability thresholds.",
                details={
                    "jitter_px": round(jitter_px, 3),
                    "warn_at": DEFAULT_THRESHOLDS["tracking_jitter_warn_px"],
                    "error_at": DEFAULT_THRESHOLDS["tracking_jitter_error_px"],
                },
                penalty_amount=0.2 if severity == "error" else 0.1,
            )

    avg_confidence = float(tracking_metrics.get("avg_confidence", 0.0) or 0.0)
    if severity := _severity_for_low(
        avg_confidence,
        DEFAULT_THRESHOLDS["avg_confidence_warn"],
        DEFAULT_THRESHOLDS["avg_confidence_error"],
    ):
        add_issue(
            "low_detections",
            severity,
            "Ball detections were low confidence.",
            details={
                "avg_confidence": round(avg_confidence, 3),
                "warn_below": DEFAULT_THRESHOLDS["avg_confidence_warn"],
                "error_below": DEFAULT_THRESHOLDS["avg_confidence_error"],
            },
            penalty_amount=0.25 if severity == "error" else 0.15,
        )

    id_switches = int(tracking_metrics.get("id_switches", 0) or 0)
    if severity := _severity_for(
        id_switches,
        DEFAULT_THRESHOLDS["id_switches_warn"],
        DEFAULT_THRESHOLDS["id_switches_error"],
    ):
        add_issue(
            "id_switches",
            severity,
            "Tracking switched identities multiple times.",
            details={
                "id_switches": id_switches,
                "warn_at": DEFAULT_THRESHOLDS["id_switches_warn"],
                "error_at": DEFAULT_THRESHOLDS["id_switches_error"],
            },
            penalty_amount=0.15 if severity == "error" else 0.1,
        )

    num_frames = int(run_stats.get("num_frames", 0) or 0)
    missing_ball_frames = int(run_stats.get("missing_ball_frames", 0) or 0)
    if num_frames > 0:
        missing_ratio = missing_ball_frames / num_frames
        if severity := _severity_for(
            missing_ratio,
            DEFAULT_THRESHOLDS["missing_ball_frames_ratio_warn"],
            DEFAULT_THRESHOLDS["missing_ball_frames_ratio_error"],
        ):
            add_issue(
                "missing_ball_frames",
                severity,
                "Ball detections were missing across frames.",
                details={
                    "missing_frames": missing_ball_frames,
                    "total_frames": num_frames,
                    "missing_ratio": round(missing_ratio, 3),
                },
                penalty_amount=0.2 if severity == "error" else 0.1,
            )

    ball_points = int(run_stats.get("ball_points", 0) or 0)
    if ball_points < DEFAULT_THRESHOLDS["min_ball_points"]:
        add_issue(
            "too_few_points",
            "warn",
            "Not enough ball points were tracked to stabilize the fit.",
            details={
                "ball_points": ball_points,
                "min_required": DEFAULT_THRESHOLDS["min_ball_points"],
            },
            penalty_amount=0.2,
        )

    fps = run_stats.get("fps")
    if isinstance(fps, (int, float)):
        if fps <= DEFAULT_THRESHOLDS["fps_error"]:
            add_issue(
                "fps_low",
                "error",
                "Capture FPS is below the recommended minimum.",
                details={
                    "fps": fps,
                    "error_below": DEFAULT_THRESHOLDS["fps_error"],
                },
                penalty_amount=0.25,
            )
        elif fps < DEFAULT_THRESHOLDS["fps_warn"]:
            add_issue(
                "fps_low",
                "warn",
                "Capture FPS is below the preferred range.",
                details={
                    "fps": fps,
                    "warn_below": DEFAULT_THRESHOLDS["fps_warn"],
                },
                penalty_amount=0.15,
            )

    camera_fps = run_stats.get("camera_fps")
    if isinstance(fps, (int, float)) and isinstance(camera_fps, (int, float)):
        fps_delta = abs(float(camera_fps) - float(fps))
        if fps_delta >= DEFAULT_THRESHOLDS["fps_mismatch_error"]:
            add_issue(
                "fps_mismatch",
                "error",
                "Reported FPS does not match the camera settings.",
                details={
                    "fps": fps,
                    "camera_fps": camera_fps,
                    "delta": round(fps_delta, 2),
                },
                penalty_amount=0.2,
            )
        elif fps_delta >= DEFAULT_THRESHOLDS["fps_mismatch_warn"]:
            add_issue(
                "fps_mismatch",
                "warn",
                "Reported FPS differs from the camera settings.",
                details={
                    "fps": fps,
                    "camera_fps": camera_fps,
                    "delta": round(fps_delta, 2),
                },
                penalty_amount=0.1,
            )

    calibration_enabled = calibration_info.get("enabled") is True
    calibration_quality = calibration_info.get("quality")
    calibration_reasons: list[str] = []
    if isinstance(calibration_quality, Mapping):
        calibration_reasons = list(calibration_quality.get("reasonCodes", []) or [])

    if calibration_enabled:
        quality = calibration_info.get("quality")
        if isinstance(quality, Mapping):
            quality_confidence = quality.get("confidence")
            if isinstance(quality_confidence, (int, float)):
                if severity := _severity_for_low(
                    float(quality_confidence),
                    DEFAULT_THRESHOLDS["calibration_confidence_warn"],
                    DEFAULT_THRESHOLDS["calibration_confidence_error"],
                ):
                    add_issue(
                        "fit_unstable",
                        severity,
                        "Calibration fit confidence is low.",
                        details={
                            "calibration_confidence": quality_confidence,
                            "warn_below": DEFAULT_THRESHOLDS[
                                "calibration_confidence_warn"
                            ],
                            "error_below": DEFAULT_THRESHOLDS[
                                "calibration_confidence_error"
                            ],
                            "reason_codes": list(quality.get("reasonCodes", [])),
                        },
                        penalty_amount=0.25 if severity == "error" else 0.15,
                    )
            reason_codes = quality.get("reasonCodes")
            if reason_codes:
                add_issue(
                    "calibration_reasons",
                    "info",
                    "Calibration reported quality warnings.",
                    details={"reason_codes": list(reason_codes)},
                    penalty_amount=0.05,
                )

        launch_window = calibration_info.get("launchWindow")
        if isinstance(launch_window, Mapping):
            start = launch_window.get("start")
            end = launch_window.get("end")
            if isinstance(start, int) and isinstance(end, int):
                length = max(0, end - start + 1)
                if length and length < DEFAULT_THRESHOLDS["launch_window_min"]:
                    add_issue(
                        "launch_window_short",
                        "warn",
                        "Launch window is shorter than expected.",
                        details={
                            "launch_window_length": length,
                            "min_required": DEFAULT_THRESHOLDS["launch_window_min"],
                        },
                        penalty_amount=0.1,
                    )
    else:
        if calibration_reasons:
            if (
                "missing_scale" in calibration_reasons
                or "calibration_missing" in calibration_reasons
            ):
                add_issue(
                    "calibration_missing",
                    "warn",
                    "Calibration scale was not available.",
                    details={"reason_codes": calibration_reasons},
                    penalty_amount=0.1,
                )
            if "launch_window_too_short" in calibration_reasons:
                add_issue(
                    "launch_window_too_short",
                    "warn",
                    "Launch window did not contain enough frames.",
                    details={"reason_codes": calibration_reasons},
                    penalty_amount=0.1,
                )
            if (
                "fit_low_confidence" in calibration_reasons
                or "calibration_unstable" in calibration_reasons
            ):
                add_issue(
                    "calibration_unstable",
                    "warn",
                    "Calibration fit quality was unstable.",
                    details={"reason_codes": calibration_reasons},
                    penalty_amount=0.15,
                )
            if "fit_failed" in calibration_reasons:
                add_issue(
                    "fit_low_confidence",
                    "warn",
                    "Trajectory fit did not converge cleanly.",
                    details={"reason_codes": calibration_reasons},
                    penalty_amount=0.15,
                )

    confidence = _clamp(1.0 - penalty)
    sorted_issues = sorted(issues, key=lambda issue: SEVERITY_ORDER[issue.severity])

    if sorted_issues:
        top_messages = [issue.message for issue in sorted_issues[:2]]
        summary = f"Confidence reduced: {'; '.join(top_messages)}"
    else:
        summary = "No issues detected."

    return {
        "confidence": round(confidence, 3),
        "issues": [issue.to_dict() for issue in sorted_issues],
        "summary": summary,
    }
