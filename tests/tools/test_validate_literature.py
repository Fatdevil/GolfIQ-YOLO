from __future__ import annotations

from pathlib import Path

from tools.playslike.validate_literature_v1 import (
    MPS_TO_MPH,
    WindAlphas,
    apply_scaling,
    compute_slope_adjust,
    compute_wind_adjust,
    evaluate_scenario,
    load_profile,
    load_scenarios,
    write_report,
)


BASE_PATH = Path(__file__).resolve().parents[2] / "tools" / "playslike"


def test_load_profile_and_scaling():
    profile = load_profile(BASE_PATH)
    assert profile.model == "percent_v1"
    assert profile.globals["alphaHead_per_mph"] == 0.01

    scaled = apply_scaling(
        profile,
        WindAlphas(alphaHead_per_mph=0.01, alphaTail_per_mph=0.005),
        club="driver",
        player_type="tour",
    )
    assert scaled.alphaHead_per_mph == 0.01 * 0.9 * 0.95
    assert scaled.alphaTail_per_mph == 0.005 * 0.9 * 0.95


def test_load_scenarios_and_evaluate(tmp_path):
    scenarios = load_scenarios(BASE_PATH)
    assert scenarios, "expected at least one validation scenario"
    scenario = scenarios[1]  # headwind percentage check

    profile = load_profile(BASE_PATH)
    result = evaluate_scenario(profile, scenario)
    assert result["passed"] is True
    assert any("pct" in check for check in result["checks"])

    report_path = tmp_path / "report.md"
    write_report(report_path, profile, scenarios[:2], [result, result])
    text = report_path.read_text(encoding="utf-8")
    assert "Plays-Like Literature Profile Validation" in text
    assert "| 2 |" in text


def test_compute_helpers_cover_tailwind():
    profile = load_profile(BASE_PATH)
    alphas = WindAlphas(
        alphaHead_per_mph=profile.globals["alphaHead_per_mph"],
        alphaTail_per_mph=profile.globals["alphaTail_per_mph"],
    )
    tailwind_adjust = compute_wind_adjust(
        distance=150.0,
        w_parallel_mps=-10.0,
        alphas=alphas,
        cap_pct=float(profile.globals["windCap_pctOfD"]),
        taper_start_mph=float(profile.globals["taperStart_mph"]),
    )
    # Tailwind should decrease effective distance and respect cap with taper
    mph = 10.0 * MPS_TO_MPH
    uncapped = 150.0 * (-alphas.alphaTail_per_mph * mph)
    assert tailwind_adjust <= 0
    assert tailwind_adjust >= uncapped  # cap/taper pulls toward zero

    slope = compute_slope_adjust(150.0, delta_h=3.0, slope_factor=1.0)
    assert slope == 3.0
