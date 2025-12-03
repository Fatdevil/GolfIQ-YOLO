from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from .models import RoundSummary


class PlayerCategoryStats(BaseModel):
    player_id: str = Field(serialization_alias="playerId")
    rounds_count: int = Field(serialization_alias="roundsCount")

    tee_shots: int = Field(serialization_alias="teeShots")
    approach_shots: int = Field(serialization_alias="approachShots")
    short_game_shots: int = Field(serialization_alias="shortGameShots")
    putts: int = Field(serialization_alias="putts")
    penalties: int = Field(serialization_alias="penalties")

    avg_tee_shots_per_round: Optional[float] = Field(
        default=None, serialization_alias="avgTeeShotsPerRound"
    )
    avg_approach_shots_per_round: Optional[float] = Field(
        default=None, serialization_alias="avgApproachShotsPerRound"
    )
    avg_short_game_shots_per_round: Optional[float] = Field(
        default=None, serialization_alias="avgShortGameShotsPerRound"
    )
    avg_putts_per_round: Optional[float] = Field(
        default=None, serialization_alias="avgPuttsPerRound"
    )

    tee_pct: Optional[float] = Field(default=None, serialization_alias="teePct")
    approach_pct: Optional[float] = Field(
        default=None, serialization_alias="approachPct"
    )
    short_game_pct: Optional[float] = Field(
        default=None, serialization_alias="shortGamePct"
    )
    putting_pct: Optional[float] = Field(default=None, serialization_alias="puttingPct")

    model_config = ConfigDict(populate_by_name=True)


def compute_player_category_stats(
    summaries: list[RoundSummary], player_id: str
) -> PlayerCategoryStats:
    completed_rounds = [
        summary
        for summary in summaries
        if summary.total_strokes is not None and summary.total_strokes > 0
    ]
    rounds_count = len(completed_rounds)

    total_tee = sum(summary.tee_shots or 0 for summary in completed_rounds)
    total_approach = sum(summary.approach_shots or 0 for summary in completed_rounds)
    total_short_game = sum(
        summary.short_game_shots or 0 for summary in completed_rounds
    )
    total_putts = sum(summary.putting_shots or 0 for summary in completed_rounds)
    total_penalties = sum(summary.penalties or 0 for summary in completed_rounds)

    total_strokes = sum(summary.total_strokes or 0 for summary in completed_rounds)

    avg_tee = total_tee / rounds_count if rounds_count else None
    avg_approach = total_approach / rounds_count if rounds_count else None
    avg_short_game = total_short_game / rounds_count if rounds_count else None
    avg_putts = total_putts / rounds_count if rounds_count else None

    tee_pct = (total_tee / total_strokes) * 100 if total_strokes else None
    approach_pct = (total_approach / total_strokes) * 100 if total_strokes else None
    short_game_pct = (total_short_game / total_strokes) * 100 if total_strokes else None
    putting_pct = (total_putts / total_strokes) * 100 if total_strokes else None

    return PlayerCategoryStats(
        player_id=player_id,
        rounds_count=rounds_count,
        tee_shots=total_tee,
        approach_shots=total_approach,
        short_game_shots=total_short_game,
        putts=total_putts,
        penalties=total_penalties,
        avg_tee_shots_per_round=avg_tee,
        avg_approach_shots_per_round=avg_approach,
        avg_short_game_shots_per_round=avg_short_game,
        avg_putts_per_round=avg_putts,
        tee_pct=tee_pct,
        approach_pct=approach_pct,
        short_game_pct=short_game_pct,
        putting_pct=putting_pct,
    )


__all__ = [
    "PlayerCategoryStats",
    "compute_player_category_stats",
]
