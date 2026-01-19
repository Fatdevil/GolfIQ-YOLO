from __future__ import annotations

from dataclasses import is_dataclass
from typing import Any, Iterable

from cv_engine.calibration.calibration_v1 import CalibrationV1Config, FitV1Result
from cv_engine.capture.range_mode import CaptureGuardrailsResult
from cv_engine.capture.range_mode_ux import RangeModeHUD

ISSUE_DEFINITIONS = {
    "fps_low": {
        "reason": {
            "id": "fps_low",
            "title": "Low frame rate",
            "detail": "Low FPS can miss the ball after impact.",
        },
        "action": {
            "id": "increase_fps",
            "title": "Increase frame rate",
            "detail": "Enable slow-mo capture (120–240 FPS).",
        },
        "penalty": 20,
    },
    "blur_high": {
        "reason": {
            "id": "blur_high",
            "title": "Too much blur",
            "detail": "Motion blur hides the ball in flight.",
        },
        "action": {
            "id": "reduce_blur",
            "title": "Reduce blur",
            "detail": "Stabilize the phone or use faster shutter.",
        },
        "penalty": 20,
    },
    "exposure_too_dark": {
        "reason": {
            "id": "exposure_too_dark",
            "title": "Too dark",
            "detail": "The ball blends into a dark background.",
        },
        "action": {
            "id": "improve_lighting",
            "title": "Add lighting",
            "detail": "Brighten the hitting area and ball.",
        },
        "penalty": 15,
    },
    "exposure_too_bright": {
        "reason": {
            "id": "exposure_too_bright",
            "title": "Too bright",
            "detail": "Glare makes the ball hard to track.",
        },
        "action": {
            "id": "reduce_glare",
            "title": "Reduce glare",
            "detail": "Lower exposure or avoid direct glare.",
        },
        "penalty": 15,
    },
    "framing_unstable": {
        "reason": {
            "id": "framing_unstable",
            "title": "Ball drifting out of frame",
            "detail": "Tracking drops when the ball leaves view.",
        },
        "action": {
            "id": "improve_framing",
            "title": "Reframe the ball",
            "detail": "Center the ball and keep it in view.",
        },
        "penalty": 15,
    },
    "ball_lost_early": {
        "reason": {
            "id": "ball_lost_early",
            "title": "Ball lost early",
            "detail": "The ball leaves frame too soon.",
        },
        "action": {
            "id": "start_earlier",
            "title": "Start recording earlier",
            "detail": "Begin before impact and keep the ball in frame.",
        },
        "penalty": 20,
    },
    "calibration_fit_r2_low": {
        "reason": {
            "id": "calibration_fit_r2_low",
            "title": "Calibration fit is weak",
            "detail": "Trajectory fit quality is low.",
        },
        "action": {
            "id": "recalibrate_scale",
            "title": "Recalibrate scale",
            "detail": "Confirm reference distance and recalibrate.",
        },
        "penalty": 15,
    },
    "calibration_fit_rmse_high": {
        "reason": {
            "id": "calibration_fit_rmse_high",
            "title": "Calibration error is high",
            "detail": "Trajectory error is above target.",
        },
        "action": {
            "id": "recalibrate_scale",
            "title": "Recalibrate scale",
            "detail": "Confirm reference distance and recalibrate.",
        },
        "penalty": 15,
    },
    "calibration_low_confidence": {
        "reason": {
            "id": "calibration_low_confidence",
            "title": "Calibration confidence low",
            "detail": "Metric fit confidence is below target.",
        },
        "action": {
            "id": "recalibrate_scale",
            "title": "Recalibrate scale",
            "detail": "Re-run calibration with clearer tracking.",
        },
        "penalty": 15,
    },
    "capture_warning": {
        "reason": {
            "id": "capture_warning",
            "title": "Capture needs attention",
            "detail": "Quality is below optimal for accuracy.",
        },
        "action": {
            "id": "improve_setup",
            "title": "Improve capture setup",
            "detail": "Address FPS, blur, and framing warnings.",
        },
        "penalty": 15,
    },
    "capture_blocked": {
        "reason": {
            "id": "capture_blocked",
            "title": "Capture blocked",
            "detail": "Quality is too low for reliable results.",
        },
        "action": {
            "id": "fix_capture",
            "title": "Fix capture quality",
            "detail": "Improve lighting, FPS, and framing before recording.",
        },
        "penalty": 40,
    },
}

ISSUE_PRIORITY = (
    "fps_low",
    "blur_high",
    "exposure_too_dark",
    "exposure_too_bright",
    "framing_unstable",
    "ball_lost_early",
    "calibration_fit_r2_low",
    "calibration_fit_rmse_high",
    "calibration_low_confidence",
    "capture_warning",
    "capture_blocked",
)

ALIASES = {
    "exposure": "exposure_too_dark",
    "exposure_low": "exposure_too_dark",
    "exposure_high": "exposure_too_bright",
    "framing": "framing_unstable",
    "framing_bad": "framing_unstable",
}

POSITIVE_ACTION = {
    "id": "record_swing",
    "title": "Record your swing",
    "detail": "Capture looks good. Go ahead and record swings.",
}


def build_explain_result_v1(
    capture_guardrails: dict[str, object] | CaptureGuardrailsResult | None,
    range_mode_hud: RangeModeHUD | dict[str, object] | None,
    calibration: FitV1Result | dict[str, object] | None,
    *,
    version: str = "v1",
) -> dict[str, object]:
    flags = _gather_flags(capture_guardrails, range_mode_hud)
    issues = _normalize_issues(flags)
    issues.update(_extract_calibration_issues(calibration))

    range_state = _extract_range_state(range_mode_hud)
    score_0_100 = _extract_score_0_100(capture_guardrails, range_mode_hud)

    if not issues:
        if range_state == "block":
            issues.add("capture_blocked")
        elif range_state == "warn":
            issues.add("capture_warning")

    selected_issues = _select_top_issues(issues)
    reasons = [ISSUE_DEFINITIONS[issue]["reason"] for issue in selected_issues]
    actions = _dedupe_actions(
        [ISSUE_DEFINITIONS[issue]["action"] for issue in selected_issues]
    )

    if not selected_issues and range_state == "ready":
        actions = [POSITIVE_ACTION]

    confidence_score = _compute_confidence_score(
        score_0_100=score_0_100,
        range_state=range_state,
        issues=issues,
    )

    return {
        "version": version,
        "confidence": {
            "score": confidence_score,
            "label": _label_for_confidence(confidence_score),
        },
        "why_may_be_wrong": reasons,
        "what_to_do_now": actions,
        "debug": {
            "signals_used": [issue for issue in selected_issues],
            "inputs_present": {
                "range_mode_hud": range_mode_hud is not None,
                "calibration": calibration is not None,
                "guardrails": capture_guardrails is not None,
            },
        },
    }


def _extract_range_state(
    range_mode_hud: RangeModeHUD | dict[str, object] | None,
) -> str:
    if range_mode_hud is None:
        return "unknown"
    if isinstance(range_mode_hud, RangeModeHUD):
        return range_mode_hud.state.value
    state = range_mode_hud.get("state")
    if isinstance(state, str):
        return state
    return "unknown"


def _extract_score_0_100(
    capture_guardrails: dict[str, object] | CaptureGuardrailsResult | None,
    range_mode_hud: RangeModeHUD | dict[str, object] | None,
) -> int | None:
    if isinstance(range_mode_hud, RangeModeHUD):
        return int(range_mode_hud.score_0_100)
    if isinstance(range_mode_hud, dict) and "score_0_100" in range_mode_hud:
        return int(range_mode_hud["score_0_100"])
    if isinstance(capture_guardrails, CaptureGuardrailsResult):
        return int(round(capture_guardrails.capture_quality_score * 100))
    if isinstance(capture_guardrails, dict) and "score" in capture_guardrails:
        return int(round(float(capture_guardrails["score"]) * 100))
    return None


def _gather_flags(
    capture_guardrails: dict[str, object] | CaptureGuardrailsResult | None,
    range_mode_hud: RangeModeHUD | dict[str, object] | None,
) -> list[str]:
    flags: list[str] = []
    if isinstance(capture_guardrails, CaptureGuardrailsResult):
        flags.extend(capture_guardrails.capture_quality_flags)
    elif isinstance(capture_guardrails, dict):
        flags.extend(_coerce_str_list(capture_guardrails.get("flags")))

    if isinstance(range_mode_hud, RangeModeHUD):
        flags.extend(_coerce_str_list(range_mode_hud.debug.get("flags")))
    elif isinstance(range_mode_hud, dict):
        debug = range_mode_hud.get("debug")
        if isinstance(debug, dict):
            flags.extend(_coerce_str_list(debug.get("flags")))
    return flags


def _extract_calibration_issues(
    calibration: FitV1Result | dict[str, object] | None,
) -> set[str]:
    if calibration is None:
        return set()

    issues: set[str] = set()
    cfg = CalibrationV1Config()

    if isinstance(calibration, FitV1Result) or is_dataclass(calibration):
        fit_r2 = getattr(calibration, "fit_r2", None)
        fit_rmse = getattr(calibration, "fit_rmse", None)
        if fit_r2 is not None and fit_r2 < cfg.min_fit_r2:
            issues.add("calibration_fit_r2_low")
        if fit_rmse is not None and fit_rmse > cfg.max_fit_rmse_m:
            issues.add("calibration_fit_rmse_high")
        return issues

    if isinstance(calibration, dict):
        quality = calibration.get("quality", {})
        if isinstance(quality, dict):
            confidence_score = quality.get("confidence_score_0_1")
            if confidence_score is not None and float(confidence_score) < 0.5:
                issues.add("calibration_low_confidence")
            reasons = _coerce_str_list(quality.get("reasons"))
            for reason in reasons:
                if reason == "fit_r2_low":
                    issues.add("calibration_fit_r2_low")
                if reason == "fit_rmse_high":
                    issues.add("calibration_fit_rmse_high")
        fit = calibration.get("fit", {})
        if isinstance(fit, dict):
            fit_r2 = fit.get("fit_r2")
            fit_rmse = fit.get("fit_rmse")
            if fit_r2 is not None and float(fit_r2) < cfg.min_fit_r2:
                issues.add("calibration_fit_r2_low")
            if fit_rmse is not None and float(fit_rmse) > cfg.max_fit_rmse_m:
                issues.add("calibration_fit_rmse_high")
        status = calibration.get("status")
        if status == "low_confidence":
            issues.add("calibration_low_confidence")

    return issues


def _normalize_issues(flags: Iterable[str]) -> set[str]:
    issues: set[str] = set()
    for flag in flags:
        issue = ALIASES.get(flag, flag)
        if issue in ISSUE_DEFINITIONS:
            issues.add(issue)
    return issues


def _select_top_issues(issues: set[str]) -> list[str]:
    selected = [issue for issue in ISSUE_PRIORITY if issue in issues]
    return selected[:3]


def _compute_confidence_score(
    *,
    score_0_100: int | None,
    range_state: str,
    issues: set[str],
) -> int:
    base = 90
    if score_0_100 is not None:
        base = min(base, int(score_0_100))
    if range_state == "block":
        base = min(base, 35)
    elif range_state == "warn":
        base = min(base, 70)

    penalty_total = sum(
        ISSUE_DEFINITIONS[issue]["penalty"]
        for issue in issues
        if issue in ISSUE_DEFINITIONS
    )
    score = base - penalty_total
    return int(max(0, min(100, round(score))))


def _label_for_confidence(score: int) -> str:
    if score >= 75:
        return "HIGH"
    if score >= 45:
        return "MED"
    return "LOW"


def _coerce_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    if isinstance(value, tuple):
        return [item for item in value if isinstance(item, str)]
    return []


def _dedupe_actions(actions: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    unique: list[dict[str, str]] = []
    for action in actions:
        action_id = action.get("id")
        if not action_id or action_id in seen:
            continue
        seen.add(action_id)
        unique.append(action)
    return unique[:3]
