import math

import pytest

from server.sg.engine import compute_round_sg
from server.sg.schemas import ShotEvent


def test_single_putt_beats_two_putt() -> None:
    single_events = [
        ShotEvent(
            hole=1,
            shot=1,
            distance_before_m=2.0,
            distance_after_m=0.0,
            lie_before="green",
            lie_after="holed",
        )
    ]
    single_total, single_holes, single_shots = compute_round_sg(single_events)

    two_putt_events = [
        ShotEvent(
            hole=1,
            shot=1,
            distance_before_m=8.0,
            distance_after_m=0.6,
            lie_before="green",
            lie_after="green",
        ),
        ShotEvent(
            hole=1,
            shot=2,
            distance_before_m=0.6,
            distance_after_m=0.0,
            lie_before="green",
            lie_after="holed",
        ),
    ]
    two_total, _, two_shots = compute_round_sg(two_putt_events)

    assert single_total > two_total
    assert single_shots[0].sg_delta > 0
    assert math.isclose(sum(s.sg_delta for s in two_shots), two_total, rel_tol=1e-9)
    assert math.isclose(
        single_holes[0].sg_total,
        sum(s.sg_delta for s in single_holes[0].sg_shots),
        rel_tol=1e-9,
    )


def test_penalty_adds_one_stroke() -> None:
    clean = [
        ShotEvent(
            hole=3,
            shot=1,
            distance_before_m=150.0,
            distance_after_m=40.0,
            lie_before="fairway",
            lie_after="rough",
        )
    ]
    penalised = [
        ShotEvent(
            hole=3,
            shot=1,
            distance_before_m=150.0,
            distance_after_m=40.0,
            lie_before="fairway",
            lie_after="rough",
            penalty=True,
        )
    ]

    clean_total, _, clean_shots = compute_round_sg(clean)
    penalised_total, _, penalised_shots = compute_round_sg(penalised)

    assert math.isclose(clean_total, clean_shots[0].sg_delta, rel_tol=1e-9)
    assert math.isclose(penalised_total, penalised_shots[0].sg_delta, rel_tol=1e-9)
    assert pytest.approx(clean_total - 1.0, rel=1e-6) == penalised_total
