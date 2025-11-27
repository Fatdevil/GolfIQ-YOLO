from __future__ import annotations

import pytest

from server.services.sg_preview import (
    SgCategory,
    _expected_approach_strokes,
    _expected_putting_strokes,
    _expected_short_game_strokes,
    _expected_tee_strokes,
    baseline_strokes,
    compute_sg_preview_for_run,
)
from server.schemas.anchors import AnchorOut


def _anchor(run_id: str, hole: int, shot: int) -> AnchorOut:
    return AnchorOut(
        runId=run_id,
        hole=hole,
        shot=shot,
        clipId=f"clip-{hole}-{shot}",
        tStartMs=0,
        tEndMs=1,
        version=1,
        createdTs=0,
        updatedTs=0,
    )


@pytest.mark.parametrize(
    "fn, distances",
    [
        (_expected_tee_strokes, [150, 320, 380, 520]),
        (_expected_approach_strokes, [60, 90, 140, 180]),
        (_expected_short_game_strokes, [5, 15, 30, 55]),
        (_expected_putting_strokes, [0.5, 2, 6, 18, 30]),
    ],
)
def test_expected_strokes_monotone(fn, distances):
    values = [fn(distance) for distance in distances]
    assert values == sorted(values), "expected strokes should be monotone with distance"


def test_baseline_strokes_increase_by_category_hint():
    assert baseline_strokes(SgCategory.TEE, 520) > baseline_strokes(SgCategory.TEE, 150)
    assert baseline_strokes(SgCategory.APPROACH, 180) > baseline_strokes(SgCategory.APPROACH, 80)
    assert baseline_strokes(SgCategory.PUTT, 15) > baseline_strokes(SgCategory.PUTT, 2)


def test_compute_sg_preview_per_hole_fields():
    run_id = "synthetic"
    anchors = [
        _anchor(run_id, 1, 1),
        _anchor(run_id, 1, 2),
        _anchor(run_id, 1, 3),
        _anchor(run_id, 2, 1),
        _anchor(run_id, 2, 2),
        _anchor(run_id, 2, 3),
        _anchor(run_id, 2, 4),
    ]

    preview = compute_sg_preview_for_run(run_id, anchors, course_id=None)

    assert len(preview.holes) == 2
    for hole in preview.holes:
        assert hole.gross_score > 0
        assert hole.sg_total == pytest.approx(sum(hole.sg_by_cat.values()))
        assert hole.worst_category in SgCategory

    hole_two = next(h for h in preview.holes if h.hole == 2)
    assert hole_two.worst_category == SgCategory.SHORT

    assert preview.round_summary is not None
    assert preview.round_summary.worst_category in SgCategory
