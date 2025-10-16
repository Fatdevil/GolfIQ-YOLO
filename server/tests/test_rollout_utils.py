from datetime import datetime, timedelta, timezone

import pytest

from server.routes import rollout


def _approx_hours(delta: timedelta) -> float:
    return delta.total_seconds() / 3600.0


def test_parse_since_handles_hours_and_iso():
    iso = "2025-01-02T03:04:05+00:00"
    since_iso, dt = rollout._parse_since(iso)
    assert since_iso == iso
    assert dt == datetime.fromisoformat(iso)

    before = datetime.now(timezone.utc)
    since_iso, dt = rollout._parse_since("12h")
    after = datetime.now(timezone.utc)
    assert before - timedelta(hours=12.1) <= dt <= after
    assert 11.9 <= _approx_hours(after - dt) <= 12.1


def test_parse_since_invalid_defaults_to_24h():
    before = datetime.now(timezone.utc)
    _, dt = rollout._parse_since(" nonsense ")
    after = datetime.now(timezone.utc)
    assert before - timedelta(hours=24.1) <= dt <= after
    assert 23.9 <= _approx_hours(after - dt) <= 24.1


@pytest.mark.parametrize(
    "value,expected",
    [
        ("Android", "android"),
        ("ios", "ios"),
        ("iPadOS", "ios"),
        ("VisionOS", "ios"),
        ("Windows", None),
        (None, None),
    ],
)
def test_normalize_platform(value, expected):
    assert rollout._normalize_platform(value) == expected


def test_extract_platform_from_nested_payload():
    payload = {
        "device": {"osName": "Android"},
        "deviceProfile": {"platform": "ios"},
    }
    assert rollout._extract_platform(payload) == "android"

    payload = {
        "device": {"os": "Darwin"},
        "deviceProfile": {"platform": "Vision"},
    }
    assert rollout._extract_platform(payload) == "ios"

    payload = {"platform": "unknown"}
    assert rollout._extract_platform(payload) is None


@pytest.mark.parametrize(
    "value,expected",
    [
        (True, True),
        (1, True),
        (0, False),
        ("true", True),
        ("YES", True),
        ("off", False),
        (None, False),
    ],
)
def test_as_bool(value, expected):
    assert rollout._as_bool(value) is expected


def test_extract_metrics_prefers_top_level(monkeypatch):
    payload = {"p95LatencyMs": 88, "fpsAvg": 55}
    assert rollout._extract_p95_latency(payload) == 88
    assert rollout._extract_fps(payload) == 55

    payload = {"metrics": {"latencyP95Ms": 99, "avgFps": 42}}
    assert rollout._extract_p95_latency(payload) == 99
    assert rollout._extract_fps(payload) == 42

    payload = {"device": {"estimatedFps": 31}}
    assert rollout._extract_fps(payload) == 31

    payload = {}
    monkeypatch.setattr(rollout.agg, "_extract_latency", lambda _: 77)
    assert rollout._extract_p95_latency(payload) == 77


def test_guard_thresholds_env_overrides(monkeypatch):
    monkeypatch.setenv("EDGE_ROLLOUT_GUARD_P95_LATENCY_MS", "150")
    monkeypatch.setenv("EDGE_ROLLOUT_GUARD_FPS_MIN", "29.5")
    thresholds = rollout._guard_thresholds()
    assert thresholds["p95_latency_ms"] == 150.0
    assert thresholds["fps_min"] == 29.5

    monkeypatch.setenv("EDGE_ROLLOUT_GUARD_P95_LATENCY_MS", "bad")
    monkeypatch.setenv("EDGE_ROLLOUT_GUARD_FPS_MIN", "worse")
    thresholds = rollout._guard_thresholds()
    assert thresholds["p95_latency_ms"] == rollout._GUARD_DEFAULTS["p95_latency_ms"]
    assert thresholds["fps_min"] == rollout._GUARD_DEFAULTS["fps_min"]


def test_aggregate_events_and_summarize(monkeypatch):
    now = datetime.now(timezone.utc)
    events = [
        {
            "timestamp": (now - timedelta(hours=1)).isoformat(),
            "rollout": {"enforced": True},
            "platform": "android",
            "p95LatencyMs": 160,
            "fpsAvg": 22,
        },
        {
            "timestamp": (now - timedelta(hours=2)).isoformat(),
            "rollout": {"enforced": False},
            "metrics": {"latencyP95Ms": 120, "fpsAvg": 33},
            "device": {"platform": "android"},
        },
        {
            "timestamp": (now - timedelta(hours=3)).isoformat(),
            "rollout": {"enforced": True},
            "device": {"platform": "ios"},
            "metrics": {"latencyP95Ms": 90, "fpsAvg": 31},
        },
        {
            "timestamp": (now - timedelta(hours=1)).isoformat(),
            "payload": {"rollout": {"enforced": False}},
        },
    ]

    monkeypatch.setattr(rollout.agg, "_iter_events", lambda limit=None: events)
    monkeypatch.setattr(rollout.agg, "_merge_payload", lambda event: event)
    monkeypatch.setattr(rollout.agg, "_coerce_iso_timestamp", lambda payload: payload["timestamp"])

    since_dt = now - timedelta(hours=4)
    buckets = rollout._aggregate_events(since_dt)

    assert buckets["android"]["enforced"]["latencies"] == [160.0]
    assert buckets["android"]["enforced"]["fps"] == [22.0]
    assert buckets["android"]["control"]["latencies"] == [120.0]
    assert buckets["android"]["control"]["fps"] == [33.0]
    assert buckets["ios"]["enforced"]["latencies"] == [90.0]

    summary = rollout._summarize(buckets, {"p95_latency_ms": 150.0, "fps_min": 25.0})
    assert summary["android"]["enforced"]["p95Latency"] == 160.0
    assert summary["android"]["breach"] is True
    assert summary["ios"]["breach"] is False


