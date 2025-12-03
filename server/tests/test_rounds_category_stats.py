import pytest

from server.rounds.models import (
    HoleScore,
    RoundScores,
    RoundSummary,
    compute_round_category_stats,
    compute_round_summary,
)
from server.rounds.stats import compute_player_category_stats


def test_compute_round_category_stats_heuristics() -> None:
    scores = RoundScores(
        round_id="r1",
        player_id="p1",
        holes={
            1: HoleScore(hole_number=1, par=4, strokes=4, putts=2, gir=True),
            2: HoleScore(hole_number=2, par=4, strokes=5, putts=2, gir=False),
            3: HoleScore(hole_number=3, par=3, strokes=3, putts=1, gir=False),
        },
    )

    stats = compute_round_category_stats(scores)

    assert stats.tee_shots == 3
    assert stats.approach_shots == 3  # 1 (GIR hole) + 1 (approach) + 1 (par 3)
    assert stats.short_game_shots == 1  # one extra stroke on hole 2
    assert stats.putts == 5
    assert stats.penalties == 0


def test_compute_round_summary_includes_categories() -> None:
    scores = RoundScores(
        round_id="r2",
        player_id="p1",
        holes={
            1: HoleScore(
                hole_number=1,
                par=4,
                strokes=6,
                putts=3,
                gir=False,
                penalties=1,
                fairway_hit=True,
            )
        },
    )

    summary = compute_round_summary(scores)

    assert summary.tee_shots == 1
    assert summary.approach_shots == 1
    assert summary.short_game_shots == 1
    assert summary.putting_shots == 3
    assert summary.penalties == 1
    assert summary.total_penalties == 1


def test_compute_player_category_stats_rollup() -> None:
    summaries = [
        RoundSummary(
            round_id="r1",
            player_id="p1",
            total_strokes=72,
            holes_played=18,
            tee_shots=18,
            approach_shots=28,
            short_game_shots=10,
            putting_shots=16,
            penalties=2,
        ),
        RoundSummary(
            round_id="r2",
            player_id="p1",
            total_strokes=75,
            holes_played=18,
            tee_shots=18,
            approach_shots=30,
            short_game_shots=12,
            putting_shots=15,
            penalties=1,
        ),
        RoundSummary(
            round_id="ignore",
            player_id="p1",
            total_strokes=None,
            holes_played=18,
        ),
    ]

    stats = compute_player_category_stats(summaries, "p1")

    assert stats.rounds_count == 2
    assert stats.tee_shots == 36
    assert stats.approach_shots == 58
    assert stats.short_game_shots == 22
    assert stats.putts == 31
    assert stats.penalties == 3

    assert stats.avg_putts_per_round == pytest.approx(15.5)
    assert stats.avg_approach_shots_per_round == pytest.approx(29)
    assert stats.putting_pct == pytest.approx((31 / (72 + 75)) * 100)
