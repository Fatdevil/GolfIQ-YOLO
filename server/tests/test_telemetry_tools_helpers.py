from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from server.tools import telemetry_aggregate as telemetry


def test_coerce_iso_timestamp_normalizes_naive_string(monkeypatch):
    result = telemetry._coerce_iso_timestamp({"timestamp": "2025-01-01T00:00:00"})
    parsed = datetime.fromisoformat(result)
    assert parsed.tzinfo == timezone.utc


def test_coerce_iso_timestamp_handles_numeric_string():
    result = telemetry._coerce_iso_timestamp({"timestamp": "1620000000000"})
    parsed = datetime.fromisoformat(result)
    assert parsed.tzinfo == timezone.utc


def test_coerce_iso_timestamp_falls_back_to_now(monkeypatch):
    fixed = datetime(2024, 1, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(
        telemetry,
        "datetime",
        SimpleNamespace(
            now=lambda tz: fixed,
            fromtimestamp=datetime.fromtimestamp,
            timezone=timezone,
        ),
    )
    result = telemetry._coerce_iso_timestamp({})
    assert result == fixed.isoformat()


def test_extract_runtime_prefers_nested_mapping():
    payload = {"runtime": {"active": "field", "name": "ignored"}}
    assert telemetry._extract_runtime(payload) == "field"


def test_extract_latency_uses_metrics_and_device():
    payload = {
        "metrics": {"latencyP95Ms": 123},
        "device": {"estimatedFps": 50},
    }
    assert telemetry._extract_latency(payload) == 123.0

    payload = {"device": {"estimatedFps": 25}}
    assert telemetry._extract_latency(payload) == 40.0
