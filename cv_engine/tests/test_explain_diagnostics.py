from cv_engine.explain.diagnostics import DEFAULT_THRESHOLDS, build_explain_result


def test_high_track_breaks_decrease_confidence() -> None:
    result = build_explain_result(
        tracking_metrics={
            "track_breaks": DEFAULT_THRESHOLDS["track_breaks_error"],
            "max_gap_frames": 0,
            "avg_confidence": 0.9,
            "id_switches": 0,
        },
        run_stats={
            "num_frames": 20,
            "missing_ball_frames": 0,
            "ball_points": 20,
            "fps": 120.0,
        },
    )
    codes = {issue["code"] for issue in result["issues"]}
    assert "track_breaks_high" in codes
    assert result["confidence"] < 1.0


def test_low_points_and_unstable_fit_surface_issues() -> None:
    result = build_explain_result(
        tracking_metrics={
            "track_breaks": 0,
            "max_gap_frames": 0,
            "avg_confidence": 0.9,
            "id_switches": 0,
        },
        calibration_info={
            "enabled": True,
            "quality": {"confidence": 0.3, "reasonCodes": ["fit_failed"]},
            "launchWindow": {"start": 0, "end": 2},
        },
        run_stats={
            "num_frames": 8,
            "missing_ball_frames": 0,
            "ball_points": 2,
            "fps": 120.0,
        },
    )
    codes = {issue["code"] for issue in result["issues"]}
    assert "too_few_points" in codes
    assert "fit_unstable" in codes


def test_good_metrics_keep_confidence_high() -> None:
    result = build_explain_result(
        tracking_metrics={
            "track_breaks": 0,
            "max_gap_frames": 0,
            "avg_confidence": 0.92,
            "id_switches": 0,
        },
        calibration_info={
            "enabled": True,
            "quality": {"confidence": 0.95, "reasonCodes": []},
            "launchWindow": {"start": 1, "end": 6},
        },
        run_stats={
            "num_frames": 20,
            "missing_ball_frames": 0,
            "ball_points": 12,
            "fps": 120.0,
        },
    )
    severities = {issue["severity"] for issue in result["issues"]}
    assert severities == set()
    assert result["confidence"] >= 0.9
