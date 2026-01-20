from __future__ import annotations

from dataclasses import is_dataclass
from typing import Any

from cv_engine.capture.range_mode_ux import RangeModeHUD

_STATE_MAP = {
    "ready": "READY",
    "warn": "WARN",
    "block": "BLOCK",
}

_CONFIDENCE_STATE_MAP = {
    "HIGH": "READY",
    "MED": "WARN",
    "MEDIUM": "WARN",
    "LOW": "BLOCK",
}

_ALLOWED_DEBUG_KEYS = ("case_id", "timestamps", "flags")


def build_ux_payload_v1(
    *,
    range_mode_hud: dict | object | None,
    explain_result: dict | None,
    micro_coach: dict | None,
    mode: str | None = None,
    debug: dict[str, object] | None = None,
    version: str = "v1",
) -> dict[str, object]:
    """Build a deterministic UX payload for mobile clients."""

    hud_payload = _normalize_hud(range_mode_hud)
    explain_payload = _normalize_payload(explain_result)
    coach_payload = _normalize_micro_coach(micro_coach)
    confidence_payload = _extract_confidence(explain_payload)

    state = _derive_state(range_mode_hud, explain_payload)
    mode_value = _normalize_mode(mode)
    debug_payload = _normalize_debug(debug)

    return {
        "version": version,
        "mode": mode_value,
        "state": state,
        "confidence": confidence_payload,
        "hud": hud_payload,
        "explain": explain_payload,
        "coach": coach_payload,
        "debug": debug_payload,
    }


def _normalize_mode(mode: str | None) -> str:
    if isinstance(mode, str):
        normalized = mode.lower()
        if normalized in {"range", "swing", "unknown"}:
            return normalized
    return "unknown"


def _derive_state(
    range_mode_hud: dict | object | None, explain_result: dict | None
) -> str:
    range_state = _extract_range_state(range_mode_hud)
    if range_state is not None:
        return _normalize_state(range_state)

    confidence_label = _extract_confidence_label(explain_result)
    if confidence_label is None:
        return "UNKNOWN"
    return _CONFIDENCE_STATE_MAP.get(confidence_label, "UNKNOWN")


def _normalize_state(state: str) -> str:
    normalized = _STATE_MAP.get(state.lower())
    if normalized is None:
        return "UNKNOWN"
    return normalized


def _extract_range_state(range_mode_hud: dict | object | None) -> str | None:
    if range_mode_hud is None:
        return None
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
    return None


def _extract_confidence(explain_result: dict | None) -> dict[str, object] | None:
    if not isinstance(explain_result, dict):
        return None
    confidence = explain_result.get("confidence")
    if not isinstance(confidence, dict):
        return None
    score = confidence.get("score")
    label = confidence.get("label")
    if score is None or not isinstance(label, str):
        return None
    return {
        "score": int(score),
        "label": label,
    }


def _extract_confidence_label(explain_result: dict | None) -> str | None:
    if not isinstance(explain_result, dict):
        return None
    confidence = explain_result.get("confidence")
    if not isinstance(confidence, dict):
        return None
    label = confidence.get("label")
    if not isinstance(label, str):
        return None
    return label.upper()


def _normalize_hud(range_mode_hud: dict | object | None) -> dict | None:
    if range_mode_hud is None:
        return None
    if isinstance(range_mode_hud, RangeModeHUD):
        return range_mode_hud.to_dict()
    if isinstance(range_mode_hud, dict):
        return dict(range_mode_hud)
    if is_dataclass(range_mode_hud):
        to_dict = getattr(range_mode_hud, "to_dict", None)
        if callable(to_dict):
            return to_dict()
    return None


def _normalize_payload(payload: dict | None) -> dict | None:
    if isinstance(payload, dict):
        return dict(payload)
    return None


def _normalize_micro_coach(micro_coach: dict | None) -> dict | None:
    if not isinstance(micro_coach, dict):
        return None
    normalized = dict(micro_coach)
    tips = micro_coach.get("tips")
    if isinstance(tips, list):
        normalized["tips"] = list(tips)[:3]
    return normalized


def _normalize_debug(debug: dict[str, object] | None) -> dict[str, object] | None:
    if not isinstance(debug, dict):
        return None
    normalized: dict[str, object] = {}
    for key in _ALLOWED_DEBUG_KEYS:
        if key in debug:
            normalized[key] = debug[key]
    return normalized or None
