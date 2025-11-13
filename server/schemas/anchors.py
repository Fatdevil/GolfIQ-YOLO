"""Pydantic schemas for run shot time anchors."""

from __future__ import annotations

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
)


class AnchorIn(BaseModel):
    hole: int = Field(..., ge=1)
    shot: int = Field(..., ge=1)
    clipId: str = Field(
        validation_alias=AliasChoices("clipId", "clip_id"), serialization_alias="clipId"
    )
    tStartMs: int = Field(
        ...,
        ge=0,
        validation_alias=AliasChoices("tStartMs", "t_start_ms"),
        serialization_alias="tStartMs",
    )
    tEndMs: int = Field(
        ...,
        ge=1,
        validation_alias=AliasChoices("tEndMs", "t_end_ms"),
        serialization_alias="tEndMs",
    )

    @field_validator("tEndMs")
    @classmethod
    def _end_after_start(cls, value: int, info: ValidationInfo) -> int:
        start = info.data.get("tStartMs")
        if start is not None and value <= int(start):
            raise ValueError("tEndMs must be > tStartMs")
        return value

    model_config = ConfigDict(populate_by_name=True)


class AnchorOut(AnchorIn):
    runId: str = Field(
        validation_alias=AliasChoices("runId", "run_id"), serialization_alias="runId"
    )
    version: int
    createdTs: int = Field(
        validation_alias=AliasChoices("createdTs", "created_ts"),
        serialization_alias="createdTs",
    )
    updatedTs: int = Field(
        validation_alias=AliasChoices("updatedTs", "updated_ts", "ts"),
        serialization_alias="updatedTs",
    )

    model_config = ConfigDict(populate_by_name=True)

    @property
    def ts(self) -> int:  # backward compatibility for legacy call sites
        return self.updatedTs

    @ts.setter
    def ts(self, value: int) -> None:
        self.updatedTs = value
