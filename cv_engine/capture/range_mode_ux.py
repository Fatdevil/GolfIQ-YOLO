from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from cv_engine.capture.range_mode import CaptureGuardrailsResult


class RangeModeUXState(str, Enum):
    READY = "ready"
    WARN = "warn"
    BLOCK = "block"


@dataclass(frozen=True)
class RangeModeHUD:
    score_0_100: int
    state: RangeModeUXState
    primary_message: str
    secondary_message: str | None
    badges: list[str]
    recommended_actions: list[str]
    debug: dict

    def to_dict(self) -> dict[str, object]:
        return {
            "score_0_100": int(self.score_0_100),
            "state": self.state.value,
            "primary_message": self.primary_message,
            "secondary_message": self.secondary_message,
            "badges": list(self.badges),
            "recommended_actions": list(self.recommended_actions),
            "debug": dict(self.debug),
        }


@dataclass(frozen=True)
class RangeModeHysteresisConfig:
    ready_score: int = 80
    warn_score: int = 55
    block_enter_frames: int = 2
    ready_enter_frames: int = 2


@dataclass(frozen=True)
class RangeModeHysteresisState:
    state: RangeModeUXState
    below_block_count: int = 0
    above_ready_count: int = 0

    def to_dict(self) -> dict[str, object]:
        return {
            "state": self.state.value,
            "below_block_count": int(self.below_block_count),
            "above_ready_count": int(self.above_ready_count),
        }


_FLAG_PRIORITY = (
    "fps_low",
    "blur_high",
    "exposure_too_dark",
    "exposure_too_bright",
    "framing_unstable",
    "ball_lost_early",
)

_FLAG_COPY = {
    "fps_low": {
        "badge": "FPS",
        "message": "Low frame rate",
        "action": "Switch to slow-mo (120–240 FPS).",
    },
    "blur_high": {
        "badge": "BLUR",
        "message": "Too much motion blur",
        "action": "Stabilize the phone or use faster shutter.",
    },
    "exposure_too_dark": {
        "badge": "LIGHT",
        "message": "Scene is too dark",
        "action": "Increase light on the hitting area.",
    },
    "exposure_too_bright": {
        "badge": "LIGHT",
        "message": "Scene is too bright",
        "action": "Reduce exposure or avoid glare.",
    },
    "framing_unstable": {
        "badge": "FRAME",
        "message": "Ball drifting out of frame",
        "action": "Move the phone lower and center the ball.",
    },
    "ball_lost_early": {
        "badge": "TRACK",
        "message": "Ball lost early",
        "action": "Start recording earlier and keep the ball in frame.",
    },
}


def build_range_mode_hud(
    guardrails_result: CaptureGuardrailsResult | dict[str, object],
    *,
    hysteresis: RangeModeHysteresisConfig | None = None,
    last_state: (
        RangeModeHysteresisState | dict[str, object] | RangeModeHUD | None
    ) = None,
    apply_hysteresis: bool = True,
) -> RangeModeHUD:
    score_0_100, flags = _extract_guardrails(guardrails_result)
    config = hysteresis or RangeModeHysteresisConfig()
    raw_state = _score_to_state(score_0_100, config)

    prev_state = _parse_last_state(last_state) if apply_hysteresis else None
    if apply_hysteresis:
        state, hysteresis_state = _apply_hysteresis(
            raw_state=raw_state,
            prev_state=prev_state,
            config=config,
        )
    else:
        state = raw_state
        hysteresis_state = RangeModeHysteresisState(state=raw_state)

    top_flags = _select_top_flags(flags, limit=2)
    messages = [_FLAG_COPY[flag]["message"] for flag in top_flags]
    actions = _unique(
        [_FLAG_COPY[flag]["action"] for flag in top_flags if flag in _FLAG_COPY]
    )
    badges = _unique(
        [_FLAG_COPY[flag]["badge"] for flag in top_flags if flag in _FLAG_COPY]
    )

    if not messages:
        primary_message = "Capture looks good"
        secondary_message = None
    else:
        primary_message = messages[0]
        secondary_message = messages[1] if len(messages) > 1 else None

    debug = {
        "raw_state": raw_state.value,
        "score_0_100": score_0_100,
        "flags": list(flags),
        "hysteresis": hysteresis_state.to_dict(),
        "apply_hysteresis": apply_hysteresis,
    }

    return RangeModeHUD(
        score_0_100=score_0_100,
        state=state,
        primary_message=primary_message,
        secondary_message=secondary_message,
        badges=badges,
        recommended_actions=actions,
        debug=debug,
    )


def _extract_guardrails(
    guardrails_result: CaptureGuardrailsResult | dict[str, object],
) -> tuple[int, list[str]]:
    if isinstance(guardrails_result, CaptureGuardrailsResult):
        score = guardrails_result.capture_quality_score
        flags = list(guardrails_result.capture_quality_flags)
    else:
        score = float(guardrails_result.get("score", 0.0))
        flags = list(guardrails_result.get("flags", []))
    score_0_100 = int(round(max(0.0, min(1.0, float(score))) * 100))
    return score_0_100, flags


def _score_to_state(
    score_0_100: int, config: RangeModeHysteresisConfig
) -> RangeModeUXState:
    if score_0_100 >= config.ready_score:
        return RangeModeUXState.READY
    if score_0_100 >= config.warn_score:
        return RangeModeUXState.WARN
    return RangeModeUXState.BLOCK


def _apply_hysteresis(
    *,
    raw_state: RangeModeUXState,
    prev_state: RangeModeHysteresisState | None,
    config: RangeModeHysteresisConfig,
) -> tuple[RangeModeUXState, RangeModeHysteresisState]:
    if prev_state is None:
        below_block_count = 1 if raw_state == RangeModeUXState.BLOCK else 0
        above_ready_count = 1 if raw_state == RangeModeUXState.READY else 0
        if raw_state == RangeModeUXState.BLOCK and config.block_enter_frames > 1:
            initial_state = RangeModeUXState.WARN
        else:
            initial_state = raw_state
        hysteresis_state = RangeModeHysteresisState(
            state=initial_state,
            below_block_count=below_block_count,
            above_ready_count=above_ready_count,
        )
        return initial_state, hysteresis_state

    below_block_count = (
        prev_state.below_block_count + 1 if raw_state == RangeModeUXState.BLOCK else 0
    )
    above_ready_count = (
        prev_state.above_ready_count + 1 if raw_state == RangeModeUXState.READY else 0
    )

    next_state = prev_state.state
    if prev_state.state != RangeModeUXState.BLOCK:
        if raw_state == RangeModeUXState.BLOCK:
            if below_block_count >= config.block_enter_frames:
                next_state = RangeModeUXState.BLOCK
            else:
                next_state = RangeModeUXState.WARN
        elif raw_state == RangeModeUXState.READY:
            if above_ready_count >= config.ready_enter_frames:
                next_state = RangeModeUXState.READY
            else:
                next_state = RangeModeUXState.WARN
        else:
            next_state = RangeModeUXState.WARN
    else:
        if raw_state == RangeModeUXState.READY:
            if above_ready_count >= config.ready_enter_frames:
                next_state = RangeModeUXState.READY
            else:
                next_state = RangeModeUXState.WARN
        elif raw_state == RangeModeUXState.WARN:
            next_state = RangeModeUXState.WARN
        else:
            next_state = RangeModeUXState.BLOCK

    hysteresis_state = RangeModeHysteresisState(
        state=next_state,
        below_block_count=below_block_count,
        above_ready_count=above_ready_count,
    )
    return next_state, hysteresis_state


def _select_top_flags(flags: Iterable[str], *, limit: int) -> list[str]:
    ordered = [flag for flag in _FLAG_PRIORITY if flag in flags]
    for flag in flags:
        if flag not in ordered and flag in _FLAG_COPY:
            ordered.append(flag)
    return ordered[:limit]


def _parse_last_state(
    last_state: RangeModeHysteresisState | dict[str, object] | RangeModeHUD | None,
) -> RangeModeHysteresisState | None:
    if last_state is None:
        return None
    if isinstance(last_state, RangeModeHysteresisState):
        return last_state
    if isinstance(last_state, RangeModeHUD):
        last_state = last_state.debug.get("hysteresis")
    if isinstance(last_state, dict):
        state_value = last_state.get("state")
        if state_value is None:
            return None
        try:
            state = RangeModeUXState(state_value)
        except ValueError:
            return None
        return RangeModeHysteresisState(
            state=state,
            below_block_count=int(last_state.get("below_block_count", 0) or 0),
            above_ready_count=int(last_state.get("above_ready_count", 0) or 0),
        )
    return None


def _unique(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        output.append(item)
    return output
