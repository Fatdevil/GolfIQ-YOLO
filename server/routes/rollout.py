from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Mapping, MutableMapping

from fastapi import APIRouter, Query

from server.tools import telemetry_aggregate as agg

router = APIRouter(prefix="/rollout", tags=["rollout"])

_GUARD_DEFAULTS = {"p95_latency_ms": 130.0, "fps_min": 28.0}


def _parse_since(value: str | None) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    if not value:
        dt = now - timedelta(hours=24)
        return dt.isoformat(), dt
    token = value.strip()
    if not token:
        dt = now - timedelta(hours=24)
        return dt.isoformat(), dt
    if token.lower().endswith("h"):
        try:
            hours = float(token[:-1])
        except ValueError:
            pass
        else:
            dt = now - timedelta(hours=max(hours, 0.0))
            return dt.isoformat(), dt
    try:
        dt = datetime.fromisoformat(token)
    except ValueError:
        dt = now - timedelta(hours=24)
    else:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
    return dt.isoformat(), dt


def _normalize_platform(value: str | None) -> str | None:
    if not value:
        return None
    token = value.strip().lower()
    if not token:
        return None
    if "android" in token:
        return "android"
    if "ios" in token or "iphone" in token or "ipad" in token or "vision" in token:
        return "ios"
    return None


def _extract_platform(payload: Mapping[str, Any]) -> str | None:
    direct = payload.get("platform") or payload.get("devicePlatform")
    if isinstance(direct, str):
        normalized = _normalize_platform(direct)
        if normalized:
            return normalized
    device = payload.get("device")
    if isinstance(device, Mapping):
        for key in ("platform", "os", "osName"):
            candidate = device.get(key)
            if isinstance(candidate, str):
                normalized = _normalize_platform(candidate)
                if normalized:
                    return normalized
    profile = payload.get("deviceProfile")
    if isinstance(profile, Mapping):
        for key in ("platform", "os", "osName"):
            candidate = profile.get(key)
            if isinstance(candidate, str):
                normalized = _normalize_platform(candidate)
                if normalized:
                    return normalized
    return None


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        token = value.strip().lower()
        return token in {"1", "true", "yes", "on"}
    return False


def _extract_p95_latency(payload: Mapping[str, Any]) -> float | None:
    for key in ("p95LatencyMs", "latencyP95Ms", "latencyP95", "p95_latency_ms"):
        value = payload.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    metrics = payload.get("metrics")
    if isinstance(metrics, Mapping):
        for key in ("p95LatencyMs", "latencyP95Ms", "latencyP95", "p95_latency_ms"):
            value = metrics.get(key)
            if isinstance(value, (int, float)):
                return float(value)
    fallback = agg._extract_latency(payload)
    if fallback is not None:
        return float(fallback)
    return None


def _extract_fps(payload: Mapping[str, Any]) -> float | None:
    for key in ("fpsAvg", "fpsAverage", "avgFps", "fps_mean"):
        value = payload.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    metrics = payload.get("metrics")
    if isinstance(metrics, Mapping):
        for key in ("fpsAvg", "fpsAverage", "avgFps", "fps_mean"):
            value = metrics.get(key)
            if isinstance(value, (int, float)):
                return float(value)
    device = payload.get("device")
    if isinstance(device, Mapping):
        for key in ("fps", "estimatedFps"):
            value = device.get(key)
            if isinstance(value, (int, float)):
                return float(value)
    return None


def _coerce_datetime(value: str) -> datetime:
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt


def _guard_thresholds() -> Dict[str, float]:
    thresholds = dict(_GUARD_DEFAULTS)
    env_latency = os.getenv("EDGE_ROLLOUT_GUARD_P95_LATENCY_MS")
    if env_latency:
        try:
            thresholds["p95_latency_ms"] = float(env_latency)
        except ValueError:
            pass
    env_fps = os.getenv("EDGE_ROLLOUT_GUARD_FPS_MIN")
    if env_fps:
        try:
            thresholds["fps_min"] = float(env_fps)
        except ValueError:
            pass
    return thresholds


def _empty_bucket() -> Dict[str, Dict[str, list[float]]]:
    return {
        "control": {"latencies": [], "fps": []},
        "enforced": {"latencies": [], "fps": []},
    }


def _aggregate_events(
    since_dt: datetime,
) -> Dict[str, Dict[str, Dict[str, list[float]]]]:
    buckets: Dict[str, Dict[str, Dict[str, list[float]]]] = {
        "android": _empty_bucket(),
        "ios": _empty_bucket(),
    }
    for raw_event in agg._iter_events(limit=5000):
        payload = agg._merge_payload(raw_event)
        timestamp_iso = agg._coerce_iso_timestamp(payload)
        event_dt = _coerce_datetime(timestamp_iso)
        if event_dt < since_dt:
            continue
        rollout = payload.get("rollout")
        if not isinstance(rollout, Mapping):
            continue
        platform = _extract_platform(payload)
        if platform not in buckets:
            continue
        cohort = "enforced" if _as_bool(rollout.get("enforced")) else "control"
        latency = _extract_p95_latency(payload)
        fps = _extract_fps(payload)
        if latency is not None:
            buckets[platform][cohort]["latencies"].append(latency)
        if fps is not None:
            buckets[platform][cohort]["fps"].append(fps)
    return buckets


def _average(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _summarize(
    buckets: Dict[str, Dict[str, Dict[str, list[float]]]],
    guard: Dict[str, float],
) -> Dict[str, Dict[str, MutableMapping[str, float] | bool]]:
    summary: Dict[str, Dict[str, MutableMapping[str, float] | bool]] = {}
    for platform, cohorts in buckets.items():
        control_lat = agg._percentile(cohorts["control"]["latencies"], 95)
        control_fps = _average(cohorts["control"]["fps"])
        enforced_lat = agg._percentile(cohorts["enforced"]["latencies"], 95)
        enforced_fps = _average(cohorts["enforced"]["fps"])
        breach = False
        if cohorts["enforced"]["latencies"] and enforced_lat > guard["p95_latency_ms"]:
            breach = True
        if cohorts["enforced"]["fps"] and enforced_fps < guard["fps_min"]:
            breach = True
        summary[platform] = {
            "control": {
                "p95Latency": round(control_lat, 2),
                "fpsAvg": round(control_fps, 2),
            },
            "enforced": {
                "p95Latency": round(enforced_lat, 2),
                "fpsAvg": round(enforced_fps, 2),
            },
            "breach": breach,
        }
    return summary


@router.get("/health")
async def rollout_health(since: str = Query("24h")) -> Dict[str, Any]:
    since_iso, since_dt = _parse_since(since)
    guard = _guard_thresholds()
    buckets = _aggregate_events(since_dt)
    summary = _summarize(buckets, guard)
    return {
        "since": since_iso,
        "android": summary.get(
            "android",
            {
                "control": {"p95Latency": 0.0, "fpsAvg": 0.0},
                "enforced": {"p95Latency": 0.0, "fpsAvg": 0.0},
                "breach": False,
            },
        ),
        "ios": summary.get(
            "ios",
            {
                "control": {"p95Latency": 0.0, "fpsAvg": 0.0},
                "enforced": {"p95Latency": 0.0, "fpsAvg": 0.0},
                "breach": False,
            },
        ),
    }
