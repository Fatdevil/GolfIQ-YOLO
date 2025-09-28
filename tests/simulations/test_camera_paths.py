import pytest

from arhud.simulation.camera_paths import simulate_camera_path


def test_pan_walk_jitter_path_outputs_metrics(tmp_path):
    traces = simulate_camera_path(
        scenario="pan_walk_jitter",
        duration_seconds=30,
        output_dir=tmp_path,
    )
    assert traces.drift_meters < 0.5, "Drift must stay within 0.5 m over 30 s"
    assert traces.latency_ms_p90 < 120, "Latency p90 must stay below 120 ms"


def test_stable_anchor_trace_written(tmp_path):
    traces = simulate_camera_path(
        scenario="steady_hold",
        duration_seconds=10,
        output_dir=tmp_path,
    )
    assert (
        tmp_path / "steady_hold.json"
    ).exists(), "Simulation should export trace file"
    assert (
        traces.anchor_confidence >= 0.9
    ), "Steady hold should maintain high anchor confidence"
