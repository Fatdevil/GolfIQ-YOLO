"""Pydantic models representing strokes-gained shot and aggregation data."""

from __future__ import annotations

from typing import List, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class ShotEvent(BaseModel):
    """An individual shot observation used to compute strokes gained."""

    run_id: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("run_id", "runId")
    )
    hole: int
    shot: int
    distance_before_m: float = Field(
        validation_alias=AliasChoices("distance_before_m", "before_m")
    )
    distance_after_m: float = Field(
        default=0.0, validation_alias=AliasChoices("distance_after_m", "after_m")
    )
    lie_before: str = Field(validation_alias=AliasChoices("lie_before", "before_lie"))
    lie_after: str = Field(
        default="green", validation_alias=AliasChoices("lie_after", "after_lie")
    )
    penalty: bool | str | None = Field(default=False)

    model_config = ConfigDict(populate_by_name=True)


class ShotSG(BaseModel):
    """Per-shot strokes-gained delta."""

    hole: int
    shot: int
    sg_delta: float


class HoleSG(BaseModel):
    """Aggregated strokes-gained over a hole."""

    hole: int
    sg_total: float = Field(alias="sg")
    sg_shots: List[ShotSG] = Field(alias="shots")

    model_config = ConfigDict(populate_by_name=True)


class RunSG(BaseModel):
    run_id: str = Field(alias="runId")
    sg_total: float = Field(alias="total_sg")
    holes: List[HoleSG]
    shots: List[ShotSG] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


__all__ = ["HoleSG", "RunSG", "ShotEvent", "ShotSG"]
