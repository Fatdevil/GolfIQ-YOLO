from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping

from fastapi import APIRouter, HTTPException, Query

_DEFAULT_FLIGHT_DIR = Path(__file__).resolve().parents[1] / "var" / "flight"
router = APIRouter(prefix="/tools/telemetry", tags=["telemetry"])


def _flight_dir() -> Path:
    override = os.getenv("FLIGHT_RECORDER_DIR")
    if override:
        return Path(override)
    return _DEFAULT_FLIGHT_DIR


def _iter_events(limit: int) -> List[Dict[str, Any]]:
    directory = _flight_dir()
    if not directory.exists():
        return []
    events: List[Dict[str, Any]] = []
    for path in sorted(directory.glob("flight-*.jsonl"), reverse=True):
        try:
            with path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    if len(events) >= limit:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    events.append(payload)
        except OSError:
            continue
        if len(events) >= limit:
            break
    return events


def _extract_device(payload: Mapping[str, Any]) -> Dict[str, Any]:
    candidates: Iterable[Mapping[str, Any]] = []
    device = payload.get("device")
    if isinstance(device, Mapping):
        candidates = [device]
    else:
        nested: List[Mapping[str, Any]] = []
        for key in ("deviceProfile", "device_profile", "profile"):
            maybe = payload.get(key)
            if isinstance(maybe, Mapping):
                nested.append(maybe)
        candidates = nested or []
    for candidate in candidates:
        return {
            "id": str(candidate.get("id") or candidate.get("deviceId") or candidate.get("device_id") or ""),
            "model": str(candidate.get("model") or candidate.get("name") or candidate.get("id") or "unknown"),
            "os": str(candidate.get("os") or candidate.get("osVersion") or candidate.get("os_version") or "unknown"),
            "tier": str(candidate.get("tier") or candidate.get("tierName") or payload.get("tier") or "unknown"),
        }
    # fallback to payload-level hints
    return {
        "id": str(payload.get("deviceId") or payload.get("device_id") or ""),
        "model": str(payload.get("deviceModel") or payload.get("model") or "unknown"),
        "os": str(payload.get("osVersion") or payload.get("os") or "unknown"),
        "tier": str(payload.get("tier") or payload.get("deviceTier") or "unknown"),
    }


def _extract_runtime(payload: Mapping[str, Any]) -> str | None:
    runtime = payload.get("runtime")
    if isinstance(runtime, Mapping):
        for key in ("active", "name", "mode", "value"):
            value = runtime.get(key)
            if isinstance(value, str):
                return value
    if isinstance(runtime, str):
        return runtime
    for key in ("activeRuntime", "runtimeMode", "runtime_name"):
        value = payload.get(key)
        if isinstance(value, str):
            return value
    return None


def _extract_latency(payload: Mapping[str, Any]) -> float | None:
    for key in ("latencyMs", "latency_ms", "latency"):
        value = payload.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    metrics = payload.get("metrics")
    if isinstance(metrics, Mapping):
        for key in ("latencyP95Ms", "latency_ms", "p95LatencyMs"):
            value = metrics.get(key)
            if isinstance(value, (int, float)):
                return float(value)
    estimated = payload.get("estimatedFps") or payload.get("fps")
    if isinstance(estimated, (int, float)) and estimated:
        return 1000.0 / float(estimated)
    device = payload.get("device")
    if isinstance(device, Mapping):
        estimated = device.get("estimatedFps")
        if isinstance(estimated, (int, float)) and estimated:
            return 1000.0 / float(estimated)
    return None


def _percentile(values: List[float], percentile: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (percentile / 100.0) * (len(sorted_values) - 1)
    lower_index = int(rank)
    upper_index = min(lower_index + 1, len(sorted_values) - 1)
    weight = rank - lower_index
    return sorted_values[lower_index] * (1 - weight) + sorted_values[upper_index] * weight


@router.get("/aggregate")
async def telemetry_aggregate(limit: int = Query(2000, ge=100, le=10000)) -> Dict[str, Any]:
    events = _iter_events(limit)
    if not events:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no telemetry captured yet")

    tier_devices: Dict[str, set[str]] = defaultdict(set)
    profile_counter: Counter[tuple[str, str]] = Counter()
    runtime_counter: Counter[str] = Counter()
    latency_samples: Dict[tuple[str, str], List[float]] = defaultdict(list)
    config_hashes: Counter[str] = Counter()

    for raw_event in events:
        payload: Dict[str, Any]
        if isinstance(raw_event.get("payload"), Mapping):
            merged: Dict[str, Any] = dict(raw_event)
            merged.update(raw_event["payload"])  # type: ignore[index]
            payload = merged
        else:
            payload = raw_event

        device = _extract_device(payload)
        tier = device.get("tier", "unknown") or "unknown"
        device_id = device.get("id") or f"{device['model']}::{device['os']}"
        tier_devices[tier.upper()].add(device_id)
        profile_counter[(device["model"], device["os"])] += 1

        runtime = _extract_runtime(payload)
        if runtime:
            runtime_counter[runtime] += 1

        latency = _extract_latency(payload)
        if latency is not None:
            latency_samples[(device["model"], device["os"])] += [latency]

        config_hash = payload.get("configHash") or payload.get("remoteConfigHash")
        if isinstance(config_hash, str) and config_hash:
            config_hashes[config_hash] += 1

    tiers_summary = [
        {"tier": tier, "count": len(devices)}
        for tier, devices in sorted(tier_devices.items())
    ]
    profiles_summary = [
        {"model": model, "os": os_version, "count": count}
        for (model, os_version), count in profile_counter.most_common(15)
    ]
    runtimes_summary = [
        {"runtime": runtime, "count": count}
        for runtime, count in runtime_counter.most_common(10)
    ]
    latency_summary = [
        {
            "model": model,
            "os": os_version,
            "p95": round(_percentile(samples, 95), 2),
            "samples": len(samples),
        }
        for (model, os_version), samples in sorted(latency_samples.items(), key=lambda item: _percentile(item[1], 95), reverse=True)
        if samples
    ][:15]
    config_summary = [
        {"hash": hash_value, "count": count}
        for hash_value, count in config_hashes.most_common(10)
    ]

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sampleSize": len(events),
        "tiers": tiers_summary,
        "profiles": profiles_summary,
        "runtimeDistribution": runtimes_summary,
        "latencyP95": latency_summary,
        "configHashes": config_summary,
    }
