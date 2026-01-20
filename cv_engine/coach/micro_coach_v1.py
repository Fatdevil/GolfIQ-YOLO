from __future__ import annotations

from dataclasses import is_dataclass
from typing import Any, Iterable

from cv_engine.capture.range_mode_ux import RangeModeHUD


TIP_RULES: tuple[dict[str, object], ...] = (
    {
        "id": "tip_fps_light",
        "priority": 1,
        "title": "Mer ljus för högre FPS",
        "detail": "Öka belysningen så kameran kan köra snabbare bildhastighet.",
        "triggers": {"fps_low", "increase_fps"},
    },
    {
        "id": "tip_stabilize_phone",
        "priority": 1,
        "title": "Stabilisera kameran",
        "detail": "Stöd mobilen och undvik panorering så bollen blir skarp.",
        "triggers": {"blur_high", "reduce_blur"},
    },
    {
        "id": "tip_keep_ball_in_frame",
        "priority": 1,
        "title": "Håll bollbanan i bild",
        "detail": "Placera mobilen stabilt så hela bollflykten syns.",
        "triggers": {
            "framing_unstable",
            "framing",
            "framing_bad",
            "improve_framing",
        },
    },
    {
        "id": "tip_capture_block",
        "priority": 1,
        "title": "Fixa fångsten först",
        "detail": "Förbättra ljus, FPS och stabilitet innan du slår.",
        "triggers": {"capture_blocked", "fix_capture"},
    },
    {
        "id": "tip_even_lighting",
        "priority": 2,
        "title": "Jämnare ljus",
        "detail": "Flytta till jämnare ljus så bollen syns tydligt.",
        "triggers": {
            "exposure_too_dark",
            "exposure_low",
            "exposure",
            "improve_lighting",
        },
    },
    {
        "id": "tip_reduce_glare",
        "priority": 2,
        "title": "Undvik motljus",
        "detail": "Vrid dig bort från starkt ljus och sänk exponeringen.",
        "triggers": {"exposure_too_bright", "exposure_high", "reduce_glare"},
    },
    {
        "id": "tip_start_earlier",
        "priority": 2,
        "title": "Starta lite tidigare",
        "detail": "Börja inspelningen före träffen och följ bollen längre.",
        "triggers": {"ball_lost_early", "start_earlier"},
    },
    {
        "id": "tip_capture_setup",
        "priority": 2,
        "title": "Vässa inspelningen",
        "detail": "Justera ljus, stabilitet och inramning för säkrare data.",
        "triggers": {"capture_warning", "improve_setup"},
    },
    {
        "id": "tip_redo_calibration",
        "priority": 3,
        "title": "Gör om kalibreringen",
        "detail": "Använd tydliga markörer och rätt avstånd när du kalibrerar.",
        "triggers": {
            "calibration_fit_r2_low",
            "calibration_fit_rmse_high",
            "calibration_low_confidence",
            "recalibrate_scale",
        },
    },
)

CAPTURE_TIP_IDS = {
    "tip_fps_light",
    "tip_stabilize_phone",
    "tip_keep_ball_in_frame",
    "tip_capture_block",
    "tip_even_lighting",
    "tip_reduce_glare",
    "tip_start_earlier",
    "tip_capture_setup",
}


def build_micro_coach_v1(
    *,
    explain_result: dict | None,
    range_mode_hud: dict | object | None,
    calibration: dict | object | None = None,
    max_tips: int = 3,
    version: str = "v1",
) -> dict:
    inputs_present = {
        "explain_result": explain_result is not None,
        "range_mode_hud": range_mode_hud is not None,
        "calibration": calibration is not None,
    }

    confidence_label = _extract_confidence_label(explain_result)
    reason_ids = _extract_item_ids(explain_result, "why_may_be_wrong")
    action_ids = _extract_item_ids(explain_result, "what_to_do_now")
    hud_flags = _extract_hud_flags(range_mode_hud)
    range_state = _extract_range_state(range_mode_hud)

    candidates, selected_rule_ids = _build_tip_candidates(
        reason_ids=reason_ids,
        action_ids=action_ids,
        hud_flags=hud_flags,
        confidence_label=confidence_label,
    )
    candidates_sorted = _sort_tips(candidates)
    capture_only = [tip for tip in candidates_sorted if tip["id"] in CAPTURE_TIP_IDS]

    enabled = False
    tips: list[dict[str, object]] = []
    if confidence_label is not None:
        if confidence_label != "LOW":
            enabled = True
            tips = candidates_sorted
        elif range_state in {"ready", "warn"} and candidates_sorted:
            enabled = True
            tips = candidates_sorted
        elif range_state == "block" and capture_only:
            enabled = True
            tips = capture_only

    max_count = max(0, int(max_tips))
    tips = tips[:max_count]

    return {
        "version": version,
        "enabled": enabled,
        "tips": tips,
        "debug": {
            "inputs_present": inputs_present,
            "selected_rule_ids": selected_rule_ids,
            "deduped_tip_ids": [tip["id"] for tip in tips],
        },
    }


def _extract_confidence_label(explain_result: dict | None) -> str | None:
    if not isinstance(explain_result, dict):
        return None
    confidence = explain_result.get("confidence")
    if isinstance(confidence, dict):
        label = confidence.get("label")
        if isinstance(label, str):
            return label
    return None


def _extract_item_ids(explain_result: dict | None, key: str) -> list[str]:
    if not isinstance(explain_result, dict):
        return []
    items = explain_result.get(key)
    if not isinstance(items, list):
        return []
    ids: list[str] = []
    for item in items:
        if isinstance(item, dict):
            item_id = item.get("id")
            if isinstance(item_id, str):
                ids.append(item_id)
    return ids


def _extract_range_state(range_mode_hud: dict | object | None) -> str:
    if range_mode_hud is None:
        return "unknown"
    if isinstance(range_mode_hud, RangeModeHUD):
        return range_mode_hud.state.value
    if is_dataclass(range_mode_hud):
        state = getattr(range_mode_hud, "state", None)
        if isinstance(state, str):
            return state
        if hasattr(state, "value"):
            return str(state.value)
    if isinstance(range_mode_hud, dict):
        state = range_mode_hud.get("state")
        if isinstance(state, str):
            return state
    return "unknown"


def _extract_hud_flags(range_mode_hud: dict | object | None) -> list[str]:
    if range_mode_hud is None:
        return []
    if isinstance(range_mode_hud, RangeModeHUD):
        return _coerce_str_list(range_mode_hud.debug.get("flags"))
    if is_dataclass(range_mode_hud):
        debug = getattr(range_mode_hud, "debug", None)
        if isinstance(debug, dict):
            return _coerce_str_list(debug.get("flags"))
    if isinstance(range_mode_hud, dict):
        debug = range_mode_hud.get("debug")
        if isinstance(debug, dict):
            return _coerce_str_list(debug.get("flags"))
    return []


def _build_tip_candidates(
    *,
    reason_ids: Iterable[str],
    action_ids: Iterable[str],
    hud_flags: Iterable[str],
    confidence_label: str | None,
) -> tuple[list[dict[str, object]], list[str]]:
    reason_set = set(reason_ids)
    action_set = set(action_ids)
    hud_set = set(hud_flags)

    candidates: list[dict[str, object]] = []
    selected_rule_ids: list[str] = []

    for rule in TIP_RULES:
        trigger_ids = rule["triggers"]
        if not isinstance(trigger_ids, set):
            continue
        matched_reasons = sorted(reason_set.intersection(trigger_ids))
        matched_actions = sorted(action_set.intersection(trigger_ids))
        matched_hud = sorted(hud_set.intersection(trigger_ids))
        if not (matched_reasons or matched_actions or matched_hud):
            continue

        selected_rule_ids.append(rule["id"])
        candidates.append(
            {
                "id": rule["id"],
                "title": rule["title"],
                "detail": rule["detail"],
                "priority": rule["priority"],
                "source": {
                    "reason_ids": matched_reasons,
                    "action_ids": matched_actions,
                    "hud_flags": matched_hud,
                    "confidence_label": confidence_label,
                },
            }
        )

    return candidates, selected_rule_ids


def _sort_tips(tips: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    unique: dict[str, dict[str, object]] = {}
    for tip in tips:
        tip_id = tip.get("id")
        if isinstance(tip_id, str) and tip_id not in unique:
            unique[tip_id] = tip

    def sort_key(item: dict[str, object]) -> tuple[int, str]:
        priority = item.get("priority")
        if not isinstance(priority, int):
            priority = 99
        tip_id = item.get("id")
        if not isinstance(tip_id, str):
            tip_id = ""
        return priority, tip_id

    return sorted(unique.values(), key=sort_key)


def _coerce_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    if isinstance(value, tuple):
        return [item for item in value if isinstance(item, str)]
    return []
