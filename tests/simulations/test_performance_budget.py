import pytest

from arhud.simulation.performance_budget import estimate_performance_budget


REFERENCE_CONFIG = {
    "fps_avg_target": 45,
    "fps_min": 30,
    "latency_ms_target": 120,
    "cold_start_target": 3.0,
}


def test_budget_estimator_flags_over_budget():
    report = estimate_performance_budget(
        device="iphone14",
        config=REFERENCE_CONFIG,
    )
    assert report.fps_avg >= REFERENCE_CONFIG["fps_min"], "Average FPS must meet minimum"
    assert report.latency_ms_p90 <= REFERENCE_CONFIG["latency_ms_target"], "Latency p90 must meet budget"
    assert report.cold_start_seconds <= REFERENCE_CONFIG["cold_start_target"], "Cold start must stay under 3 seconds"


def test_budget_report_includes_thermal_notes():
    report = estimate_performance_budget(
        device="pixel7",
        config=REFERENCE_CONFIG,
    )
    assert report.thermal_warnings_logged, "Thermal warnings should be recorded in the report"