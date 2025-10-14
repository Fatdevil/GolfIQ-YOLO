from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AliasChoices, BaseModel, Field, field_validator
from pydantic.config import ConfigDict

from server.security import require_api_key
from scripts.edge_recommend import recommend_defaults

ROUTER_TAGS = ["bench"]

RUNS_PATH = Path(
    os.getenv("EDGE_BENCH_RUNS_PATH", "data/bench/edge_runs.jsonl")
).resolve()
DEFAULTS_PATH = Path(
    os.getenv("EDGE_DEFAULTS_PATH", "models/edge_defaults.json")
).resolve()
RECENT = int(os.getenv("EDGE_BENCH_RECENT", "200") or "200")

router = APIRouter(prefix="", tags=ROUTER_TAGS, dependencies=[Depends(require_api_key)])


class EdgeBenchRun(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    device: str = Field(..., min_length=1)
    os: str = Field(..., min_length=1)
    appVersion: str = Field(..., alias="appVersion", min_length=1)
    platform: str = Field(...)
    runtime: str = Field(...)
    inputSize: int = Field(..., ge=1)
    quant: str = Field(...)
    threads: int = Field(..., ge=1, le=32)
    delegate: Optional[str] = Field(default=None)
    dryRun: bool = Field(default=False)
    fps: float = Field(..., gt=0, validation_alias=AliasChoices("fpsAvg", "fps"))
    p50: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("p50Latency", "p50"),
        gt=0,
    )
    p95: float = Field(..., gt=0, validation_alias=AliasChoices("p95Latency", "p95"))
    memDelta: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("memDelta", "memoryDelta"),
    )
    batteryDelta: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("batteryDelta", "battery"),
    )
    batteryStart: Optional[float] = Field(default=None)
    batteryEnd: Optional[float] = Field(default=None)
    thermal: Optional[str] = Field(default=None)
    ts: Optional[datetime] = Field(default=None)

    @field_validator("platform", mode="before")
    @classmethod
    def _normalize_platform(cls, value: object) -> str:
        if not isinstance(value, str):
            raise TypeError("platform must be a string")
        normalized = value.strip().lower()
        if normalized not in {"android", "ios"}:
            raise ValueError("platform must be android or ios")
        return normalized

    @field_validator("runtime", "quant", mode="before")
    @classmethod
    def _strip_lower(cls, value: object) -> str:
        if not isinstance(value, str):
            raise TypeError("value must be a string")
        return value.strip().lower()

    @field_validator("delegate", mode="before")
    @classmethod
    def _normalize_delegate(cls, value: object) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip().lower()
            return cleaned or None
        raise TypeError("delegate must be a string or null")

    @field_validator("ts", mode="after")
    @classmethod
    def _default_ts(cls, value: Optional[datetime]) -> datetime:
        if value is None:
            return datetime.now(timezone.utc)
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def _append_run(record: Dict[str, object]) -> None:
    RUNS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with RUNS_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True))
        handle.write("\n")


@router.post("/bench/edge", status_code=status.HTTP_201_CREATED)
async def submit_edge_bench(payload: EdgeBenchRun) -> Dict[str, object]:
    record = payload.model_dump(by_alias=True)
    ts = payload.ts.isoformat()
    record["ts"] = ts
    record["dryRun"] = bool(payload.dryRun)
    record["receivedAt"] = datetime.now(timezone.utc).isoformat()
    try:
        _append_run(record)
    except OSError as exc:  # pragma: no cover - unlikely but handled
        raise HTTPException(status_code=500, detail=f"persist failed: {exc}") from exc
    return {"stored": True, "ts": ts}


@router.get("/bench/summary")
async def bench_summary() -> Dict[str, Dict[str, object]]:
    try:
        defaults = recommend_defaults(RUNS_PATH, DEFAULTS_PATH, RECENT)
    except OSError as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"aggregate failed: {exc}") from exc
    return defaults
