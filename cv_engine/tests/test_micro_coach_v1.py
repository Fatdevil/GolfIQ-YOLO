from cv_engine.coach.micro_coach_v1 import CAPTURE_TIP_IDS, build_micro_coach_v1


def test_high_confidence_surfaces_tips_deterministically() -> None:
    explain_result = {
        "confidence": {"label": "HIGH"},
        "why_may_be_wrong": [{"id": "fps_low"}],
        "what_to_do_now": [{"id": "increase_fps"}],
    }
    range_mode_hud = {"state": "warn", "debug": {"flags": ["fps_low"]}}

    first = build_micro_coach_v1(
        explain_result=explain_result,
        range_mode_hud=range_mode_hud,
        calibration=None,
        max_tips=3,
    )
    second = build_micro_coach_v1(
        explain_result=explain_result,
        range_mode_hud=range_mode_hud,
        calibration=None,
        max_tips=3,
    )

    assert first["enabled"] is True
    assert 1 <= len(first["tips"]) <= 3
    assert first["tips"] == second["tips"]


def test_low_confidence_block_limits_to_capture_tips() -> None:
    explain_result = {
        "confidence": {"label": "LOW"},
        "why_may_be_wrong": [
            {"id": "fps_low"},
            {"id": "calibration_fit_r2_low"},
        ],
        "what_to_do_now": [
            {"id": "increase_fps"},
            {"id": "recalibrate_scale"},
        ],
    }
    range_mode_hud = {"state": "block", "debug": {"flags": ["fps_low"]}}

    result = build_micro_coach_v1(
        explain_result=explain_result,
        range_mode_hud=range_mode_hud,
        calibration=None,
        max_tips=3,
    )

    assert len(result["tips"]) <= 3
    if result["enabled"]:
        assert all(tip["id"] in CAPTURE_TIP_IDS for tip in result["tips"])


def test_missing_explain_result_disables_micro_coach() -> None:
    result = build_micro_coach_v1(
        explain_result=None,
        range_mode_hud=None,
        calibration=None,
        max_tips=3,
    )

    assert result["enabled"] is False
    assert result["tips"] == []


def test_dedup_and_ordering_is_stable() -> None:
    explain_result = {
        "confidence": {"label": "MED"},
        "why_may_be_wrong": [
            {"id": "fps_low"},
            {"id": "blur_high"},
            {"id": "framing_unstable"},
        ],
        "what_to_do_now": [
            {"id": "increase_fps"},
            {"id": "reduce_blur"},
            {"id": "improve_framing"},
        ],
    }
    range_mode_hud = {"state": "warn", "debug": {"flags": ["fps_low"]}}

    result = build_micro_coach_v1(
        explain_result=explain_result,
        range_mode_hud=range_mode_hud,
        calibration=None,
        max_tips=3,
    )

    tip_ids = [tip["id"] for tip in result["tips"]]
    assert tip_ids == [
        "tip_fps_light",
        "tip_keep_ball_in_frame",
        "tip_stabilize_phone",
    ]
