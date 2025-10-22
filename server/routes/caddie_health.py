from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/caddie", tags=["caddie"])


class CaddieMcHealth(BaseModel):
    enabledPct: float = Field(..., ge=0.0, le=100.0)
    adoptRate: float = Field(..., ge=0.0, le=1.0)
    hazardRate: float = Field(..., ge=0.0, le=1.0)
    fairwayRate: float = Field(..., ge=0.0, le=1.0)
    avgLongErr: float
    avgLatErr: float


class CaddieAdviceHealth(BaseModel):
    adoptRate: float = Field(..., ge=0.0, le=1.0)
    topAdvice: List[str]


class CaddieTtsHealth(BaseModel):
    playRate: float = Field(..., ge=0.0, le=1.0)
    avgChars: float


class CaddieHealthResponse(BaseModel):
    since: str
    mc: CaddieMcHealth
    advice: CaddieAdviceHealth
    tts: CaddieTtsHealth


def _parse_since_param(value: Optional[str]) -> timedelta:
    if value is None or not value.strip():
        return timedelta(hours=24)
    raw = value.strip().lower()
    match = re.fullmatch(r"(\d+)([smhd]?)", raw)
    if not match:
        raise HTTPException(status_code=400, detail="invalid since parameter")
    amount = int(match.group(1))
    unit = match.group(2) or "h"
    if unit == "s":
        return timedelta(seconds=amount)
    if unit == "m":
        return timedelta(minutes=amount)
    if unit == "h":
        return timedelta(hours=amount)
    if unit == "d":
        return timedelta(days=amount)
    raise HTTPException(status_code=400, detail="invalid since parameter")


def _runs_root() -> Path:
    return Path(os.getenv("RUNS_DATA_DIR", "data/runs")).resolve()


def _parse_timestamp(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _iter_recent_hud_runs(cutoff: datetime) -> Iterable[str]:
    hud_dir = _runs_root() / "hud"
    if not hud_dir.exists():
        return []
    entries: List[str] = []
    for path in sorted(hud_dir.glob("*.jsonl"), reverse=True):
        try:
            with path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    created = _parse_timestamp(payload.get("created_at"))
                    if not created or created < cutoff:
                        continue
                    run_id = payload.get("id")
                    if isinstance(run_id, str) and run_id.strip():
                        entries.append(run_id.strip())
        except OSError:
            continue
    return entries


def _load_run_events(run_id: str) -> List[Dict[str, Any]]:
    by_id = _runs_root() / "by_id" / f"{run_id}.json"
    try:
        data = json.loads(by_id.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


@router.get("/health", response_model=CaddieHealthResponse)
def caddie_health(
    since: Optional[str] = Query(None, description="Lookback window, e.g. 24h")
):
    window = _parse_since_param(since)
    cutoff = datetime.now(timezone.utc) - window

    plan_total = 0
    plan_mc = 0
    adoption_mc_total = 0
    adoption_mc_true = 0
    adoption_adv_total = 0
    adoption_adv_true = 0
    advice_counter: Counter[str] = Counter()
    mc_events = 0
    hazard_sum = 0.0
    fairway_sum = 0.0
    long_sum = 0.0
    lat_sum = 0.0
    tts_events = 0
    chars_sum = 0.0

    for run_id in _iter_recent_hud_runs(cutoff):
        last_plan_context: Optional[Dict[str, bool]] = None
        last_plan_ts: Optional[float] = None
        for event in _load_run_events(run_id):
            name = event.get("event")
            data = event.get("data")
            if not isinstance(name, str) or not isinstance(data, dict):
                continue
            if name == "hud.caddie.plan":
                plan_total += 1
                mc_used = bool(data.get("mcUsed"))
                if mc_used:
                    plan_mc += 1
                advice_texts: List[str] = []
                raw_advice = data.get("adviceText")
                if isinstance(raw_advice, list):
                    for item in raw_advice:
                        if isinstance(item, str):
                            text = item.strip()
                            if text:
                                advice_texts.append(text)
                                advice_counter[text] += 1
                had_advice = bool(advice_texts)
                last_plan_context = {"mcUsed": mc_used, "hadAdvice": had_advice}
                ts_value = (
                    event.get("ts")
                    or event.get("time")
                    or event.get("timestamp")
                    or event.get("timestampMs")
                )
                try:
                    last_plan_ts = float(ts_value) if ts_value is not None else None
                except (TypeError, ValueError):
                    last_plan_ts = None
            elif name == "hud.caddie.adopt":
                adopted = bool(data.get("adopted"))

                within = False
                if last_plan_ts is not None:
                    ts_value = (
                        event.get("ts")
                        or event.get("time")
                        or event.get("timestamp")
                        or event.get("timestampMs")
                    )
                    try:
                        ts_float = float(ts_value) if ts_value is not None else None
                    except (TypeError, ValueError):
                        ts_float = None
                    if ts_float is not None:
                        within = abs(ts_float - float(last_plan_ts)) <= 120.0

                if last_plan_context and within:
                    if last_plan_context.get("mcUsed"):
                        adoption_mc_total += 1
                        if adopted:
                            adoption_mc_true += 1
                    if last_plan_context.get("hadAdvice"):
                        adoption_adv_total += 1
                        if adopted:
                            adoption_adv_true += 1
                last_plan_context = None
                last_plan_ts = None
            elif name == "hud.caddie.mc":
                mc_events += 1
                hazard_sum += float(data.get("pHazard") or 0.0)
                fairway_sum += float(data.get("pFairway") or 0.0)
                long_sum += float(data.get("expLongMiss_m") or 0.0)
                lat_sum += float(data.get("expLatMiss_m") or 0.0)
            elif name == "hud.caddie.tts":
                tts_events += 1
                chars = data.get("chars")
                if isinstance(chars, (int, float)):
                    chars_sum += float(chars)

    def safe_div(num: float, den: float) -> float:
        if den <= 0:
            return 0.0
        return num / den

    mc_enabled_pct = safe_div(plan_mc * 100.0, float(plan_total))
    mc_adopt_rate = safe_div(float(adoption_mc_true), float(adoption_mc_total))
    mc_hazard_rate = safe_div(hazard_sum, float(mc_events))
    mc_fairway_rate = safe_div(fairway_sum, float(mc_events))
    mc_long_err = safe_div(long_sum, float(mc_events))
    mc_lat_err = safe_div(lat_sum, float(mc_events))

    advice_adopt_rate = safe_div(float(adoption_adv_true), float(adoption_adv_total))
    top_advice = [text for text, _ in advice_counter.most_common(3)]

    tts_play_rate = safe_div(float(tts_events), float(plan_total))
    tts_avg_chars = safe_div(chars_sum, float(tts_events))

    response = CaddieHealthResponse(
        since=cutoff.isoformat(),
        mc=CaddieMcHealth(
            enabledPct=mc_enabled_pct,
            adoptRate=mc_adopt_rate,
            hazardRate=mc_hazard_rate,
            fairwayRate=mc_fairway_rate,
            avgLongErr=mc_long_err,
            avgLatErr=mc_lat_err,
        ),
        advice=CaddieAdviceHealth(adoptRate=advice_adopt_rate, topAdvice=top_advice),
        tts=CaddieTtsHealth(playRate=tts_play_rate, avgChars=tts_avg_chars),
    )
    return response
