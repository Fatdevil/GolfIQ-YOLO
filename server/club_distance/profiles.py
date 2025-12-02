from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .models import ClubDistanceStats

ShotShapeIntent = Literal["fade", "draw", "straight"]

DEFAULT_CARRY_STD_M = 5.0
DEFAULT_SIDE_STD_M = 3.0
MIN_SIDE_STD_M = 0.5


class ShotShapeProfile(BaseModel):
    club: str
    intent: ShotShapeIntent

    core_carry_mean_m: float = Field(alias="coreCarryMeanM")
    core_carry_std_m: float = Field(alias="coreCarryStdM")
    core_side_mean_m: float = Field(alias="coreSideMeanM")
    core_side_std_m: float = Field(alias="coreSideStdM")

    tail_left_prob: float = Field(alias="tailLeftProb")
    tail_right_prob: float = Field(alias="tailRightProb")

    model_config = ConfigDict(populate_by_name=True)


def build_shot_shape_profile(
    stats: ClubDistanceStats,
    intent: ShotShapeIntent,
) -> ShotShapeProfile:
    carry_std = (
        stats.carry_std_m if stats.carry_std_m is not None else DEFAULT_CARRY_STD_M
    )

    if stats.lateral:
        side_mean = stats.lateral.mean_side_m
        side_std = max(stats.lateral.std_side_m, MIN_SIDE_STD_M)
        total_shots = max(1, stats.lateral.total_shots)
        tail_left = stats.lateral.outlier_left_count / total_shots
        tail_right = stats.lateral.outlier_right_count / total_shots
    else:
        side_mean = 0.0
        side_std = DEFAULT_SIDE_STD_M
        tail_left = 0.0
        tail_right = 0.0

    return ShotShapeProfile(
        club=stats.club,
        intent=intent,
        core_carry_mean_m=stats.baseline_carry_m,
        core_carry_std_m=carry_std,
        core_side_mean_m=side_mean,
        core_side_std_m=side_std,
        tail_left_prob=tail_left,
        tail_right_prob=tail_right,
    )


__all__ = ["ShotShapeProfile", "ShotShapeIntent", "build_shot_shape_profile"]
