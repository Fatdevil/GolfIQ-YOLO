from __future__ import annotations

import math

from cv_engine.pose.adapter import PoseAdapter


def test_pose_adapter_derives_expected_angles_and_tempo() -> None:
    adapter = PoseAdapter(backend_name="none")
    history = [
        {
            "left_shoulder": (0.0, 10.0, 0.9),
            "right_shoulder": (10.0, 0.0, 0.9),
            "left_hip": (0.0, 20.0, 0.9),
            "right_hip": (10.0, 18.0, 0.9),
            "right_wrist": (5.0, 30.0, 0.9),
        },
        {"right_wrist": (5.0, 15.0, 0.9)},
        {"right_wrist": (5.0, 25.0, 0.9)},
    ]

    metrics = adapter.derive_metrics(history)
    assert math.isclose(metrics["shoulder_tilt_deg"], 45.0, rel_tol=1e-2)
    assert metrics["hip_tilt_deg"] and metrics["hip_tilt_deg"] > 0
    assert math.isclose(metrics["tempo_ratio"], 2.0, rel_tol=1e-3)


def test_pose_adapter_history_reset() -> None:
    adapter = PoseAdapter(backend_name="none")
    adapter._history.extend([{"right_wrist": (0.0, 5.0, 0.9)}])  # type: ignore[attr-defined]
    adapter.reset()
    metrics = adapter.get_internal_metrics()
    assert all(value is None for value in metrics.values())
