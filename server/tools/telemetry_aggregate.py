from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional

from fastapi import APIRouter, HTTPException, Query, status

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


def _merge_payload(event: Mapping[str, Any]) -> Dict[str, Any]:
    merged: Dict[str, Any] = dict(event)
    nested = event.get("payload")
    if isinstance(nested, Mapping):
        merged.update(nested)
    return merged


def _coerce_iso_timestamp(payload: Mapping[str, Any]) -> str:
    candidate = payload.get("timestampMs") or payload.get("ts")
    if isinstance(candidate, (int, float)):
        dt = datetime.fromtimestamp(float(candidate) / 1000.0, timezone.utc)
        return dt.isoformat()

    raw = payload.get("timestamp")
    if isinstance(raw, (int, float)):
        dt = datetime.fromtimestamp(float(raw) / 1000.0, timezone.utc)
        return dt.isoformat()
    if isinstance(raw, str) and raw:
        cleaned = raw
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)
            return dt.isoformat()
        except ValueError:
            try:
                numeric = float(cleaned)
            except ValueError:
                pass
            else:
                if numeric > 1e12:
                    numeric = numeric / 1000.0
                dt = datetime.fromtimestamp(numeric, timezone.utc)
                return dt.isoformat()

    return datetime.now(timezone.utc).isoformat()


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
            "id": str(
                candidate.get("id")
                or candidate.get("deviceId")
                or candidate.get("device_id")
                or ""
            ),
            "model": str(
                candidate.get("model")
                or candidate.get("name")
                or candidate.get("id")
                or "unknown"
            ),
            "os": str(
                candidate.get("os")
                or candidate.get("osVersion")
                or candidate.get("os_version")
                or "unknown"
            ),
            "tier": str(
                candidate.get("tier")
                or candidate.get("tierName")
                or payload.get("tier")
                or "unknown"
            ),
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
    return (
        sorted_values[lower_index] * (1 - weight) + sorted_values[upper_index] * weight
    )


@router.get("/aggregate")
async def telemetry_aggregate(
    limit: int = Query(2000, ge=100, le=10000)
) -> Dict[str, Any]:
    events = _iter_events(limit)
    if not events:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="no telemetry captured yet"
        )

    tier_devices: Dict[str, set[str]] = defaultdict(set)
    profile_counter: Counter[tuple[str, str]] = Counter()
    runtime_counter: Counter[str] = Counter()
    latency_samples: Dict[tuple[str, str], List[float]] = defaultdict(list)
    config_hashes: Counter[str] = Counter()

    for raw_event in events:
        payload = _merge_payload(raw_event)

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
        for (model, os_version), samples in sorted(
            latency_samples.items(),
            key=lambda item: _percentile(item[1], 95),
            reverse=True,
        )
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


@router.get("/feedback")
async def telemetry_feedback(
    limit: int = Query(100, ge=1, le=1000),
) -> Dict[str, Any]:
    events = _iter_events(limit * 5)
    feedback_entries: List[Dict[str, Any]] = []

    for raw_event in events:
        payload = _merge_payload(raw_event)
        if payload.get("event") != "user_feedback":
            continue

        feedback = payload.get("feedback")
        if not isinstance(feedback, Mapping):
            continue

        message = str(feedback.get("message") or "").strip()
        if not message:
            continue

        category = str(feedback.get("category") or "unknown").lower()
        qa_summary = feedback.get("qaSummary")
        if isinstance(qa_summary, Mapping):
            qa_summary_payload: Optional[MutableMapping[str, Any]] = dict(qa_summary)
        elif isinstance(qa_summary, str):
            qa_summary_payload = {"text": qa_summary}
        else:
            qa_summary_payload = None

        sink_raw = feedback.get("sink")
        sink: Optional[Dict[str, str]] = None
        if isinstance(sink_raw, Mapping):
            filtered: Dict[str, str] = {}
            for key in ("email", "webhook"):
                value = sink_raw.get(key)
                if isinstance(value, str) and value.strip():
                    filtered[key] = value.strip()
            if filtered:
                sink = filtered

        timestamp_iso = _coerce_iso_timestamp(payload)
        device = _extract_device(payload)

        feedback_entries.append(
            {
                "id": str(
                    payload.get("id")
                    or payload.get("session_id")
                    or f"{timestamp_iso}-{len(feedback_entries)}"
                ),
                "timestamp": timestamp_iso,
                "category": category,
                "message": message,
                "device": device,
                "tier": device.get("tier", "unknown"),
                "qaSummary": qa_summary_payload,
                "sink": sink,
            }
        )

    feedback_entries.sort(key=lambda item: item["timestamp"], reverse=True)
    sliced = feedback_entries[:limit]

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(sliced),
        "items": sliced,
    }
