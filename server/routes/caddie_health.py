from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import math

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/caddie", tags=["caddie"])


TRAINING_FOCUS_VALUES = (
    "long-drive",
    "tee",
    "approach",
    "wedge",
    "short",
    "putt",
    "recovery",
)
TRAINING_FOCUS_SET = set(TRAINING_FOCUS_VALUES)


class FocusTrend(BaseModel):
    d7: float
    d30: float


class CaddieMcHealth(BaseModel):
    enabledPct: float = Field(..., ge=0.0, le=100.0)
    adoptRate: float = Field(..., ge=0.0, le=1.0)
    hazardRate: float = Field(..., ge=0.0, le=1.0)
    hazardRateTee: float = Field(..., ge=0.0, le=1.0)
    hazardRateApproach: float = Field(..., ge=0.0, le=1.0)
    fairwayRate: float = Field(..., ge=0.0, le=1.0)
    avgLongErr: float
    avgLatErr: float
    evLift: float
    ab: CaddieFeatureAb | None = None


class CaddieAdviceHealth(BaseModel):
    adoptRate: float = Field(..., ge=0.0, le=1.0)
    topAdvice: List[str]
    ab: CaddieFeatureAb | None = None


class CaddieTtsHealth(BaseModel):
    playRate: float = Field(..., ge=0.0, le=1.0)
    avgChars: float
    ab: CaddieTtsAb | None = None


class FeatureAbGroup(BaseModel):
    plans: int = 0
    adopts: int = 0
    sg_total: float = 0.0
    rounds: int = 0
    adoptRate: float = Field(0.0, ge=0.0, le=1.0)
    sgPerRound: float = 0.0


class FeatureAbDelta(BaseModel):
    adoptRate: float | None = None
    sgPerRound: float | None = None


class CaddieFeatureAb(BaseModel):
    control: FeatureAbGroup
    enforced: FeatureAbGroup
    delta: FeatureAbDelta


class TtsAbGroup(BaseModel):
    plans: int = 0
    plays: int = 0
    adopts: int = 0
    sg_total: float = 0.0
    rounds: int = 0
    playRate: float = Field(0.0, ge=0.0, le=1.0)
    sgPerRound: float = 0.0


class TtsAbDelta(BaseModel):
    playRate: float | None = None
    sgPerRound: float | None = None


class CaddieTtsAb(BaseModel):
    control: TtsAbGroup
    enforced: TtsAbGroup
    delta: TtsAbDelta


class SgPerRound(BaseModel):
    sample: int
    mean: float | None
    median: float | None


class FocusAdoption(BaseModel):
    plans: int = 0
    adopts: int = 0
    adoptRate: float = Field(0.0, ge=0.0, le=1.0)


class CaddieHealthResponse(BaseModel):
    since: str
    mc: CaddieMcHealth
    advice: CaddieAdviceHealth
    tts: CaddieTtsHealth
    sg_gained_per_round: SgPerRound
    adoption_sg_lift: float | None
    sg_gained_per_round_by_focus: Dict[str, SgPerRound]
    adoption_by_focus: Dict[str, FocusAdoption]
    sg_trend_by_focus: Dict[str, FocusTrend]
    coach_weight_delta: float
    sg_lift_by_focus: Dict[str, float]


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


def _finite_float(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _median(values: List[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def _extract_ts_seconds(event: Dict[str, Any]) -> Optional[float]:
    for key in ("ts", "time", "timestamp", "timestampMs"):
        value = event.get(key)
        if value is None:
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if number > 1e12:
            return number / 1000.0
        return number
    return None


def _average_focus_window(
    entries: List[Tuple[datetime, float]], start: datetime, end: datetime
) -> Optional[float]:
    values = [value for ts, value in entries if start < ts <= end]
    if not values:
        return None
    return sum(values) / len(values)


def _focus_window_delta(
    entries: List[Tuple[datetime, float]], now: datetime, window: timedelta
) -> Optional[float]:
    current_start = now - window
    previous_start = current_start - window
    current_avg = _average_focus_window(entries, current_start, now)
    if current_avg is None:
        return None
    previous_avg = _average_focus_window(entries, previous_start, current_start)
    baseline = previous_avg if previous_avg is not None else 0.0
    return current_avg - baseline


def _compute_focus_trend(
    history: Dict[str, List[Tuple[datetime, float]]], now: datetime
) -> Dict[str, FocusTrend]:
    result: Dict[str, FocusTrend] = {}
    for focus_key, values in history.items():
        ordered = sorted(values, key=lambda item: item[0])
        delta_7 = _focus_window_delta(ordered, now, timedelta(days=7))
        delta_30 = _focus_window_delta(ordered, now, timedelta(days=30))
        if delta_7 is None and delta_30 is None:
            continue
        result[focus_key] = FocusTrend(
            d7=delta_7 if delta_7 is not None else 0.0,
            d30=delta_30 if delta_30 is not None else 0.0,
        )
    return result


@router.get("/health", response_model=CaddieHealthResponse)
def caddie_health(
    since: Optional[str] = Query(None, description="Lookback window, e.g. 24h")
):
    window = _parse_since_param(since)
    now = datetime.now(timezone.utc)
    cutoff = now - window

    plan_total = 0
    advice_counter: Counter[str] = Counter()
    mc_events = 0
    hazard_sum = 0.0
    hazard_sum_by_kind: Dict[str, float] = {"tee": 0.0, "approach": 0.0}
    hazard_events_by_kind: Dict[str, int] = {"tee": 0, "approach": 0}
    success_sum = 0.0
    long_sum = 0.0
    lat_sum = 0.0
    ev_sum_by_group: Dict[str, float] = {"control": 0.0, "enforced": 0.0}
    ev_count_by_group: Dict[str, int] = {"control": 0, "enforced": 0}
    tts_events = 0
    chars_sum = 0.0
    sg_totals: List[float] = []
    adopted_sg: List[float] = []
    other_sg: List[float] = []
    focus_adoption: Dict[str, Dict[str, int]] = {}
    focus_round_totals: Dict[str, List[float]] = {}
    focus_sg_history: Dict[str, List[Tuple[datetime, float]]] = {}
    coach_weight_deltas: List[float] = []
    focus_lift_samples: Dict[str, List[float]] = {}

    mc_groups = {
        "control": {"plans": 0, "adopts": 0, "sg_total": 0.0, "rounds": 0},
        "enforced": {"plans": 0, "adopts": 0, "sg_total": 0.0, "rounds": 0},
    }
    advice_groups = {
        "control": {"plans": 0, "adopts": 0, "sg_total": 0.0, "rounds": 0},
        "enforced": {"plans": 0, "adopts": 0, "sg_total": 0.0, "rounds": 0},
    }
    tts_groups = {
        "control": {"plans": 0, "plays": 0, "sg_total": 0.0, "rounds": 0},
        "enforced": {"plans": 0, "plays": 0, "sg_total": 0.0, "rounds": 0},
    }

    for run_id in _iter_recent_hud_runs(cutoff):
        last_plan_context: Optional[Dict[str, Any]] = None
        last_plan_ts: Optional[float] = None
        run_sg_total = 0.0
        run_has_sg = False
        run_focus_totals: Dict[str, float] = {}
        run_timestamp_seconds: Optional[float] = None
        run_rollout: Dict[str, Optional[bool]] = {
            "mc": None,
            "advice": None,
            "tts": None,
        }
        for event in _load_run_events(run_id):
            name = event.get("event")
            data = event.get("data")
            if not isinstance(name, str) or not isinstance(data, dict):
                continue
            ts_seconds = _extract_ts_seconds(event)
            if ts_seconds is not None:
                if run_timestamp_seconds is None or ts_seconds < run_timestamp_seconds:
                    run_timestamp_seconds = ts_seconds
            if name == "hud.caddie.rollout":
                mc_flag = data.get("mc")
                advice_flag = data.get("advice")
                tts_flag = data.get("tts")
                if isinstance(mc_flag, bool):
                    run_rollout["mc"] = mc_flag
                if isinstance(advice_flag, bool):
                    run_rollout["advice"] = advice_flag
                if isinstance(tts_flag, bool):
                    run_rollout["tts"] = tts_flag
                continue
            if name == "hud.caddie.plan":
                plan_total += 1
                mc_used = bool(data.get("mcUsed"))
                advice_texts: List[str] = []
                raw_advice = data.get("adviceText")
                if isinstance(raw_advice, list):
                    for item in raw_advice:
                        if isinstance(item, str):
                            text = item.strip()
                            if text:
                                advice_texts.append(text)
                                advice_counter[text] += 1
                advice_flag_raw = data.get("hadAdvice")
                had_advice = (
                    bool(advice_flag_raw)
                    if advice_flag_raw is not None
                    else bool(advice_texts)
                )
                tts_flag_raw = data.get("ttsUsed")
                tts_used = (
                    bool(tts_flag_raw)
                    if tts_flag_raw is not None
                    else bool(run_rollout["tts"])
                )
                if mc_used:
                    mc_groups["enforced"]["plans"] += 1
                else:
                    mc_groups["control"]["plans"] += 1
                if had_advice:
                    advice_groups["enforced"]["plans"] += 1
                else:
                    advice_groups["control"]["plans"] += 1
                if tts_used:
                    tts_groups["enforced"]["plans"] += 1
                else:
                    tts_groups["control"]["plans"] += 1
                if run_rollout["mc"] is None:
                    run_rollout["mc"] = mc_used
                if run_rollout["advice"] is None:
                    run_rollout["advice"] = had_advice
                if run_rollout["tts"] is None:
                    run_rollout["tts"] = tts_used
                focus_value = data.get("focus")
                focus_token: Optional[str] = None
                if isinstance(focus_value, str):
                    candidate = focus_value.strip()
                    if candidate and candidate in TRAINING_FOCUS_SET:
                        focus_token = candidate
                        entry = focus_adoption.setdefault(
                            candidate, {"plans": 0, "adopts": 0}
                        )
                        entry["plans"] += 1
                last_plan_context = {
                    "mcUsed": mc_used,
                    "hadAdvice": had_advice,
                    "ttsUsed": tts_used,
                    "focus": focus_token,
                }
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
                    mc_key = (
                        "enforced" if last_plan_context.get("mcUsed") else "control"
                    )
                    advice_key = (
                        "enforced" if last_plan_context.get("hadAdvice") else "control"
                    )
                    mc_groups[mc_key]["adopts"] += int(adopted)
                    advice_groups[advice_key]["adopts"] += int(adopted)
                    focus_key = last_plan_context.get("focus")
                    if isinstance(focus_key, str):
                        focus_entry = focus_adoption.setdefault(
                            focus_key,
                            {"plans": 0, "adopts": 0},
                        )
                        focus_entry["adopts"] += int(adopted)
            elif name == "hud.shot":
                sg_data = data.get("sg")
                if isinstance(sg_data, dict):
                    total_value = _finite_float(sg_data.get("total"))
                    if total_value is not None:
                        run_has_sg = True
                        run_sg_total += total_value
                        adopted_flag = data.get("planAdopted")
                        if adopted_flag is True:
                            adopted_sg.append(total_value)
                        elif adopted_flag is False:
                            other_sg.append(total_value)
                    by_focus = sg_data.get("byFocus")
                    if isinstance(by_focus, dict):
                        for focus_key, focus_value in by_focus.items():
                            if not isinstance(focus_key, str):
                                continue
                            candidate = focus_key.strip()
                            if not candidate or candidate not in TRAINING_FOCUS_SET:
                                continue
                            focus_sg_value = _finite_float(focus_value)
                            if focus_sg_value is None:
                                continue
                            run_focus_totals[candidate] = (
                                run_focus_totals.get(candidate, 0.0) + focus_sg_value
                            )
                rollout_data = data.get("rollout")
                if isinstance(rollout_data, dict):
                    for key in ("mc", "advice", "tts"):
                        value = rollout_data.get(key)
                        if isinstance(value, bool) and run_rollout.get(key) is None:
                            run_rollout[key] = value
                last_plan_context = None
                last_plan_ts = None
            elif name == "hud.caddie.mc":
                mc_events += 1
                hazard_rate = float(data.get("hazardRate") or 0.0)
                success_rate = float(data.get("successRate") or 0.0)
                ev_value = float(data.get("ev") or 0.0)
                long_mean = float(data.get("expectedLongMiss_m") or 0.0)
                lat_mean = float(data.get("expectedLatMiss_m") or 0.0)
                hazard_sum += hazard_rate
                success_sum += success_rate
                long_sum += long_mean
                lat_sum += lat_mean
                kind = data.get("kind")
                if isinstance(kind, str) and kind in hazard_sum_by_kind:
                    hazard_sum_by_kind[kind] += hazard_rate
                    hazard_events_by_kind[kind] += 1
                if run_rollout["mc"] is None:
                    run_rollout["mc"] = True
                group_key = "enforced" if run_rollout.get("mc") else "control"
                ev_sum_by_group[group_key] += ev_value
                ev_count_by_group[group_key] += 1
            elif name == "hud.caddie.tts":
                tts_events += 1
                chars = data.get("chars")
                if isinstance(chars, (int, float)):
                    chars_sum += float(chars)
                if run_rollout["tts"] is None:
                    run_rollout["tts"] = True
                tts_key = "enforced" if run_rollout["tts"] else "control"
                tts_groups[tts_key]["plays"] += 1
            elif name == "coach.profile.updated":
                d_weights = data.get("dWeights")
                if isinstance(d_weights, dict):
                    deltas = [
                        abs(float(val))
                        for val in d_weights.values()
                        if isinstance(val, (int, float))
                    ]
                    if deltas:
                        coach_weight_deltas.append(sum(deltas) / len(deltas))
                lift_payload = data.get("sgLiftByFocus")
                if isinstance(lift_payload, dict):
                    for focus_key, lift_value in lift_payload.items():
                        if (
                            not isinstance(focus_key, str)
                            or focus_key not in TRAINING_FOCUS_SET
                        ):
                            continue
                        numeric = _finite_float(lift_value)
                        if numeric is None:
                            continue
                        focus_lift_samples.setdefault(focus_key, []).append(numeric)

        if run_has_sg:
            sg_totals.append(run_sg_total)
            mc_key = "enforced" if run_rollout.get("mc") else "control"
            advice_key = "enforced" if run_rollout.get("advice") else "control"
            tts_key = "enforced" if run_rollout.get("tts") else "control"
            mc_groups[mc_key]["sg_total"] += run_sg_total
            mc_groups[mc_key]["rounds"] += 1
            advice_groups[advice_key]["sg_total"] += run_sg_total
            advice_groups[advice_key]["rounds"] += 1
            tts_groups[tts_key]["sg_total"] += run_sg_total
            tts_groups[tts_key]["rounds"] += 1
            for focus_key, value in run_focus_totals.items():
                focus_round_totals.setdefault(focus_key, []).append(value)
            if run_timestamp_seconds is not None:
                run_dt = datetime.fromtimestamp(run_timestamp_seconds, tz=timezone.utc)
                for focus_key, value in run_focus_totals.items():
                    focus_sg_history.setdefault(focus_key, []).append((run_dt, value))

    def safe_div(num: float, den: float) -> float:
        if den <= 0:
            return 0.0
        return num / den

    def clamp_unit(value: float) -> float:
        if value < 0.0:
            return 0.0
        if value > 1.0:
            return 1.0
        return value

    def build_feature_group(raw: Dict[str, Any]) -> FeatureAbGroup:
        plans = int(raw.get("plans", 0))
        adopts = int(raw.get("adopts", 0))
        sg_total = float(raw.get("sg_total", 0.0))
        rounds = int(raw.get("rounds", 0))
        adopt_rate = clamp_unit(safe_div(float(adopts), float(plans)))
        sg_per_round = safe_div(sg_total, float(rounds))
        return FeatureAbGroup(
            plans=plans,
            adopts=adopts,
            sg_total=sg_total,
            rounds=rounds,
            adoptRate=adopt_rate,
            sgPerRound=sg_per_round,
        )

    def build_tts_group(raw: Dict[str, Any]) -> TtsAbGroup:
        plans = int(raw.get("plans", 0))
        plays = int(raw.get("plays", 0))
        sg_total = float(raw.get("sg_total", 0.0))
        rounds = int(raw.get("rounds", 0))
        play_rate = clamp_unit(safe_div(float(plays), float(plans)))
        sg_per_round = safe_div(sg_total, float(rounds))
        return TtsAbGroup(
            plans=plans,
            plays=plays,
            adopts=plays,
            sg_total=sg_total,
            rounds=rounds,
            playRate=play_rate,
            sgPerRound=sg_per_round,
        )

    mc_control_group = build_feature_group(mc_groups["control"])
    mc_enforced_group = build_feature_group(mc_groups["enforced"])
    mc_ab = CaddieFeatureAb(
        control=mc_control_group,
        enforced=mc_enforced_group,
        delta=FeatureAbDelta(
            adoptRate=mc_enforced_group.adoptRate - mc_control_group.adoptRate,
            sgPerRound=mc_enforced_group.sgPerRound - mc_control_group.sgPerRound,
        ),
    )

    advice_control_group = build_feature_group(advice_groups["control"])
    advice_enforced_group = build_feature_group(advice_groups["enforced"])
    advice_ab = CaddieFeatureAb(
        control=advice_control_group,
        enforced=advice_enforced_group,
        delta=FeatureAbDelta(
            adoptRate=advice_enforced_group.adoptRate - advice_control_group.adoptRate,
            sgPerRound=advice_enforced_group.sgPerRound
            - advice_control_group.sgPerRound,
        ),
    )

    tts_control_group = build_tts_group(tts_groups["control"])
    tts_enforced_group = build_tts_group(tts_groups["enforced"])
    tts_ab = CaddieTtsAb(
        control=tts_control_group,
        enforced=tts_enforced_group,
        delta=TtsAbDelta(
            playRate=tts_enforced_group.playRate - tts_control_group.playRate,
            sgPerRound=tts_enforced_group.sgPerRound - tts_control_group.sgPerRound,
        ),
    )

    mc_enabled_pct = safe_div(mc_enforced_group.plans * 100.0, float(plan_total))
    mc_adopt_rate = mc_enforced_group.adoptRate
    mc_hazard_rate = safe_div(hazard_sum, float(mc_events))
    mc_hazard_rate_tee = safe_div(
        hazard_sum_by_kind["tee"], float(hazard_events_by_kind["tee"])
    )
    mc_hazard_rate_approach = safe_div(
        hazard_sum_by_kind["approach"], float(hazard_events_by_kind["approach"])
    )
    mc_success_rate = safe_div(success_sum, float(mc_events))
    mc_long_err = safe_div(long_sum, float(mc_events))
    mc_lat_err = safe_div(lat_sum, float(mc_events))
    mc_ev_control = safe_div(ev_sum_by_group["control"], float(ev_count_by_group["control"]))
    mc_ev_enforced = safe_div(
        ev_sum_by_group["enforced"], float(ev_count_by_group["enforced"])
    )
    mc_ev_lift = mc_ev_enforced - mc_ev_control

    advice_adopt_rate = advice_enforced_group.adoptRate
    top_advice = [text for text, _ in advice_counter.most_common(3)]

    tts_play_rate = safe_div(float(tts_events), float(plan_total))
    tts_avg_chars = safe_div(chars_sum, float(tts_events))

    sg_mean = (sum(sg_totals) / len(sg_totals)) if sg_totals else None
    sg_median = _median(sg_totals)
    adopted_avg = (sum(adopted_sg) / len(adopted_sg)) if adopted_sg else None
    other_avg = (sum(other_sg) / len(other_sg)) if other_sg else None
    lift = (
        adopted_avg - other_avg
        if adopted_avg is not None and other_avg is not None
        else None
    )

    focus_keys = sorted(set(focus_round_totals.keys()) | set(focus_adoption.keys()))
    focus_sg_summary: Dict[str, SgPerRound] = {}
    focus_adoption_summary: Dict[str, FocusAdoption] = {}
    for key in focus_keys:
        totals = focus_round_totals.get(key, [])
        sample = len(totals)
        focus_sg_summary[key] = SgPerRound(
            sample=sample,
            mean=(sum(totals) / sample) if sample else None,
            median=_median(totals),
        )
        raw = focus_adoption.get(key, {"plans": 0, "adopts": 0})
        plans = int(raw.get("plans", 0)) if isinstance(raw, dict) else 0
        adopts = int(raw.get("adopts", 0)) if isinstance(raw, dict) else 0
        rate = clamp_unit(safe_div(float(adopts), float(plans))) if plans else 0.0
        focus_adoption_summary[key] = FocusAdoption(
            plans=plans,
            adopts=adopts,
            adoptRate=rate,
        )

    focus_trend_summary = _compute_focus_trend(focus_sg_history, now)

    avg_weight_delta = (
        sum(coach_weight_deltas) / len(coach_weight_deltas)
        if coach_weight_deltas
        else 0.0
    )
    sg_lift_by_focus: Dict[str, float] = {}
    for focus_key, samples in focus_lift_samples.items():
        if samples:
            sg_lift_by_focus[focus_key] = sum(samples) / len(samples)

    return CaddieHealthResponse(
        since=cutoff.isoformat(),
        mc=CaddieMcHealth(
            enabledPct=mc_enabled_pct,
            adoptRate=mc_adopt_rate,
            hazardRate=mc_hazard_rate,
            hazardRateTee=mc_hazard_rate_tee,
            hazardRateApproach=mc_hazard_rate_approach,
            fairwayRate=mc_success_rate,
            avgLongErr=mc_long_err,
            avgLatErr=mc_lat_err,
            evLift=mc_ev_lift,
            ab=mc_ab,
        ),
        advice=CaddieAdviceHealth(
            adoptRate=advice_adopt_rate,
            topAdvice=top_advice,
            ab=advice_ab,
        ),
        tts=CaddieTtsHealth(playRate=tts_play_rate, avgChars=tts_avg_chars, ab=tts_ab),
        sg_gained_per_round=SgPerRound(
            sample=len(sg_totals), mean=sg_mean, median=sg_median
        ),
        adoption_sg_lift=lift,
        sg_gained_per_round_by_focus=focus_sg_summary,
        adoption_by_focus=focus_adoption_summary,
        sg_trend_by_focus=focus_trend_summary,
        coach_weight_delta=avg_weight_delta,
        sg_lift_by_focus=sg_lift_by_focus,
    )
