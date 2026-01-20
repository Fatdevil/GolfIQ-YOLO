from cv_engine.coach.micro_coach_v1 import build_micro_coach_v1
from cv_engine.explain.explain_result_v1 import build_explain_result_v1
from cv_engine.ux.ux_payload_v1 import build_ux_payload_v1


def test_build_ux_payload_v1_is_deterministic() -> None:
    range_mode_hud = {
        "state": "warn",
        "score_0_100": 60,
        "debug": {"flags": ["fps_low"]},
    }
    explain_result = build_explain_result_v1(
        capture_guardrails=None,
        range_mode_hud=range_mode_hud,
        calibration=None,
    )
    micro_coach = build_micro_coach_v1(
        explain_result=explain_result,
        range_mode_hud=range_mode_hud,
        max_tips=5,
    )

    first = build_ux_payload_v1(
        range_mode_hud=range_mode_hud,
        explain_result=explain_result,
        micro_coach=micro_coach,
        mode="range",
    )
    second = build_ux_payload_v1(
        range_mode_hud=range_mode_hud,
        explain_result=explain_result,
        micro_coach=micro_coach,
        mode="range",
    )

    assert first == second
    assert first["version"] == "v1"
    assert first["state"] == "WARN"
    assert first["confidence"] == explain_result["confidence"]
    assert len(first["coach"]["tips"]) <= 3


def test_build_ux_payload_v1_handles_missing_inputs() -> None:
    payload = build_ux_payload_v1(
        range_mode_hud=None,
        explain_result=None,
        micro_coach=None,
    )

    assert payload["hud"] is None
    assert payload["explain"] is None
    assert payload["coach"] is None
    assert payload["confidence"] is None
    assert payload["state"] == "UNKNOWN"
    assert payload["mode"] == "unknown"


def test_build_ux_payload_v1_state_from_explain() -> None:
    explain_result = {
        "confidence": {"score": 20, "label": "LOW"},
    }

    payload = build_ux_payload_v1(
        range_mode_hud=None,
        explain_result=explain_result,
        micro_coach=None,
    )

    assert payload["state"] == "BLOCK"
