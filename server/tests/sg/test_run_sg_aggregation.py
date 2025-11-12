"""Integration tests for run-level strokes-gained aggregation."""

from __future__ import annotations

import math

from server.sg.engine import compute_run_sg
from server.sg.schemas import ShotEvent


def build_shot(
    hole: int,
    shot: int,
    before: float,
    after: float,
    lie: str,
    penalty: str | None = None,
) -> ShotEvent:
    return ShotEvent(
        hole=hole,
        shot=shot,
        ts=shot,  # deterministic placeholder
        before_m=before,
        after_m=after,
        before_lie=lie,
        penalty=penalty,
    )


def test_run_aggregation_consistency():
    events = [
        build_shot(1, 1, 380.0, 150.0, "tee"),
        build_shot(1, 2, 150.0, 4.0, "fairway"),
        build_shot(1, 3, 4.0, 0.0, "green"),
        build_shot(2, 1, 160.0, 40.0, "tee"),
        build_shot(2, 2, 40.0, 12.0, "rough"),
        build_shot(2, 3, 12.0, 2.0, "green"),
        build_shot(2, 4, 2.0, 0.0, "green"),
    ]

    result = compute_run_sg(events)

    assert len(result.holes) == 2

    total_from_holes = 0.0
    for hole in result.holes:
        shot_sum = sum(shot.sg_delta for shot in hole.shots)
        assert math.isclose(shot_sum, hole.sg, abs_tol=1e-6)
        total_from_holes += hole.sg

    assert math.isclose(total_from_holes, result.total_sg, abs_tol=1e-6)
