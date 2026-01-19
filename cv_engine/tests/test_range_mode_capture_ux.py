from cv_engine.capture.range_mode import CaptureGuardrailsResult
from cv_engine.capture.range_mode_ux import (
    RangeModeHysteresisConfig,
    RangeModeUXState,
    build_range_mode_hud,
)


def _guardrails_result(score: float, flags: list[str]) -> CaptureGuardrailsResult:
    return CaptureGuardrailsResult(
        capture_quality_score=score,
        capture_quality_flags=flags,
        capture_recommendations=[],
        diagnostics={},
    )


def test_hud_state_mapping_from_score():
    config = RangeModeHysteresisConfig(block_enter_frames=1, ready_enter_frames=1)
    ready = build_range_mode_hud(_guardrails_result(0.9, []), hysteresis=config)
    warn = build_range_mode_hud(_guardrails_result(0.7, ["fps_low"]), hysteresis=config)
    block = build_range_mode_hud(
        _guardrails_result(0.4, ["fps_low"]), hysteresis=config
    )

    assert ready.state == RangeModeUXState.READY
    assert warn.state == RangeModeUXState.WARN
    assert block.state == RangeModeUXState.BLOCK


def test_hud_primary_message_from_flags():
    hud = build_range_mode_hud(_guardrails_result(0.6, ["fps_low", "blur_high"]))
    assert hud.primary_message == "Low frame rate"
    assert hud.secondary_message == "Too much motion blur"


def test_hud_hysteresis_blocks_after_consecutive_frames():
    config = RangeModeHysteresisConfig(block_enter_frames=2, ready_enter_frames=2)
    first = build_range_mode_hud(
        _guardrails_result(0.4, ["fps_low"]),
        hysteresis=config,
        last_state=None,
    )
    second = build_range_mode_hud(
        _guardrails_result(0.4, ["fps_low"]),
        hysteresis=config,
        last_state=first.debug["hysteresis"],
    )

    assert first.state == RangeModeUXState.WARN
    assert second.state == RangeModeUXState.BLOCK


def test_hud_single_eval_can_block_without_hysteresis():
    hud = build_range_mode_hud(
        _guardrails_result(0.4, ["fps_low"]),
        apply_hysteresis=False,
    )
    assert hud.state == RangeModeUXState.BLOCK


def test_hud_hysteresis_ready_requires_consecutive_frames():
    config = RangeModeHysteresisConfig(block_enter_frames=2, ready_enter_frames=2)
    start = build_range_mode_hud(
        _guardrails_result(0.4, ["fps_low"]),
        hysteresis=config,
        last_state=None,
    )
    step_one = build_range_mode_hud(
        _guardrails_result(0.9, []),
        hysteresis=config,
        last_state=start.debug["hysteresis"],
    )
    step_two = build_range_mode_hud(
        _guardrails_result(0.9, []),
        hysteresis=config,
        last_state=step_one.debug["hysteresis"],
    )

    assert step_one.state == RangeModeUXState.WARN
    assert step_two.state == RangeModeUXState.READY


def test_hud_top_issue_selection_prioritized():
    hud = build_range_mode_hud(
        _guardrails_result(
            0.3,
            [
                "ball_lost_early",
                "exposure_too_bright",
                "framing_unstable",
                "blur_high",
                "fps_low",
            ],
        )
    )
    assert hud.badges == ["FPS", "BLUR"]
    assert len(hud.recommended_actions) == 2
