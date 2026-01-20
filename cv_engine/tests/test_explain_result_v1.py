from cv_engine.explain.explain_result_v1 import build_explain_result_v1


def test_block_state_sets_low_confidence_and_reasons() -> None:
    result = build_explain_result_v1(
        capture_guardrails={"score": 0.2, "flags": []},
        range_mode_hud={"state": "block", "score_0_100": 20},
        calibration=None,
    )

    assert result["confidence"]["label"] == "LOW"
    assert result["why_may_be_wrong"]
    assert result["what_to_do_now"]


def test_warn_state_with_fps_low_surfaces_reason_and_action() -> None:
    result = build_explain_result_v1(
        capture_guardrails={"score": 0.6, "flags": ["fps_low"]},
        range_mode_hud={"state": "warn", "score_0_100": 60},
        calibration=None,
    )

    assert result["confidence"]["label"] != "HIGH"
    assert result["why_may_be_wrong"][0]["id"] == "fps_low"
    assert result["what_to_do_now"][0]["id"] == "increase_fps"


def test_ready_state_with_no_issues_is_positive() -> None:
    result = build_explain_result_v1(
        capture_guardrails={"score": 0.95, "flags": []},
        range_mode_hud={"state": "ready", "score_0_100": 95},
        calibration=None,
    )

    assert result["confidence"]["label"] == "HIGH"
    assert result["why_may_be_wrong"] == []
    assert result["what_to_do_now"][0]["id"] == "record_swing"


def test_ordering_is_deterministic() -> None:
    inputs = dict(
        capture_guardrails={
            "score": 0.4,
            "flags": ["blur_high", "fps_low", "framing_unstable"],
        },
        range_mode_hud={"state": "warn", "score_0_100": 40},
        calibration=None,
    )

    first = build_explain_result_v1(**inputs)
    second = build_explain_result_v1(**inputs)

    assert first["why_may_be_wrong"] == second["why_may_be_wrong"]
    assert first["what_to_do_now"] == second["what_to_do_now"]
