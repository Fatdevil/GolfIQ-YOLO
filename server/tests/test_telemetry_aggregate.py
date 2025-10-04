import json
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.tools import telemetry_aggregate as agg


@pytest.fixture
def flight_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(tmp_path))
    return tmp_path


def _write_jsonl(path: Path, events):
    with path.open("w", encoding="utf-8") as handle:
        for event in events:
            if isinstance(event, str):
                handle.write(event + "\n")
            else:
                handle.write(json.dumps(event) + "\n")


def test_flight_dir_override(monkeypatch, tmp_path):
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(tmp_path / "custom"))
    assert agg._flight_dir() == tmp_path / "custom"


def test_flight_dir_defaults_to_repo_path(monkeypatch):
    monkeypatch.delenv("FLIGHT_RECORDER_DIR", raising=False)
    assert agg._flight_dir() == agg._DEFAULT_FLIGHT_DIR


def test_iter_events_reads_latest_files(monkeypatch, tmp_path):
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(tmp_path))
    first = tmp_path / "flight-20240101.jsonl"
    second = tmp_path / "flight-20240102.jsonl"
    _write_jsonl(
        first,
        [
            {"idx": 1},
            "",  # blank line should be ignored
            "not-json",  # invalid line skipped
        ],
    )
    _write_jsonl(second, [{"idx": 2}, {"idx": 3}])

    events = agg._iter_events(limit=10)
    assert [event["idx"] for event in events] == [2, 3, 1]


def test_iter_events_enforces_limit_and_skips_errors(monkeypatch, tmp_path):
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(tmp_path))
    primary = tmp_path / "flight-20240105.jsonl"
    secondary = tmp_path / "flight-20240104.jsonl"
    failing = tmp_path / "flight-20240106.jsonl"

    _write_jsonl(primary, [{"idx": "primary-1"}, {"idx": "primary-2"}])
    _write_jsonl(secondary, [{"idx": "secondary-1"}])
    failing.write_text("[]", encoding="utf-8")

    original_open = Path.open

    def fake_open(self, *args, **kwargs):  # type: ignore[override]
        if self == failing:
            raise OSError("boom")
        return original_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", fake_open)

    events = agg._iter_events(limit=1)
    assert len(events) == 1
    assert events[0]["idx"] == "primary-1"


def test_iter_events_handles_missing_directory(monkeypatch):
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", "/non-existent-dir-for-tests")
    assert agg._iter_events(limit=5) == []


def test_percentile_edge_cases():
    assert agg._percentile([], 95) == 0.0
    assert agg._percentile([42.0], 95) == 42.0
    assert agg._percentile([10.0, 20.0, 30.0, 40.0], 90) == pytest.approx(37.0)


def test_extract_device_fallbacks():
    payload = {
        "deviceId": "dev-x",
        "deviceModel": "Fallback Model",
        "osVersion": "1.0",
        "tier": "tierZ",
    }
    extracted = agg._extract_device(payload)
    assert extracted == {
        "id": "dev-x",
        "model": "Fallback Model",
        "os": "1.0",
        "tier": "tierZ",
    }


def test_extract_runtime_variants():
    assert agg._extract_runtime({"runtime": {"mode": "immersive"}}) == "immersive"
    assert agg._extract_runtime({"runtime": "flat"}) == "flat"
    assert agg._extract_runtime({"runtimeMode": "mixed"}) == "mixed"
    assert agg._extract_runtime({}) is None


def test_extract_latency_variants():
    assert agg._extract_latency({"latencyMs": 33}) == 33.0
    assert agg._extract_latency({"metrics": {"p95LatencyMs": 44}}) == 44.0
    assert agg._extract_latency({"fps": 25}) == pytest.approx(40.0)
    assert agg._extract_latency({"device": {"estimatedFps": 80}}) == pytest.approx(12.5)
    assert agg._extract_latency({}) is None


def test_telemetry_aggregate_404_when_empty(flight_dir):
    client = TestClient(app)
    response = client.get("/tools/telemetry/aggregate")
    assert response.status_code == 404


def test_telemetry_aggregate_summarizes_payloads(flight_dir):
    latest = flight_dir / "flight-20240202.jsonl"
    older = flight_dir / "flight-20240115.jsonl"

    _write_jsonl(
        older,
        [
            {  # event with direct payload merge and metrics-derived latency
                "timestamp": "2024-01-15T01:00:00Z",
                "payload": {
                    "device": {
                        "id": "dev-1",
                        "model": "VisionPro",
                        "os": "visionOS 1.2",
                        "tier": "tierA",
                        "estimatedFps": 50,
                    },
                    "runtime": {"name": "immersive"},
                    "metrics": {"latencyP95Ms": 45},
                    "configHash": "hash-1",
                },
            },
            "not-json",
        ],
    )

    _write_jsonl(
        latest,
        [
            {  # event relying on deviceProfile keys and direct latency
                "deviceProfile": {
                    "deviceId": "dev-2",
                    "name": "Galaxy Ultra",
                    "osVersion": "Android 14",
                    "tierName": "tierB",
                },
                "activeRuntime": "mobile",
                "latencyMs": 60,
                "remoteConfigHash": "hash-2",
            },
            {  # fallback to top-level keys and fps-derived latency
                "deviceId": "dev-3",
                "deviceModel": "Quest",
                "osVersion": "QuestOS 15",
                "tier": "tierC",
                "runtime": "sim",
                "fps": 20.0,
            },
            {  # latency derived from nested device estimated FPS
                "device": {
                    "device_id": "dev-4",
                    "model": "AROne",
                    "os": "CustomOS",
                    "tier": "tierA",
                    "estimatedFps": 80,
                },
                "runtimeMode": "desktop",
            },
        ],
    )

    client = TestClient(app)
    response = client.get("/tools/telemetry/aggregate?limit=200")
    assert response.status_code == 200
    payload = response.json()

    # metadata
    datetime.fromisoformat(payload["generatedAt"])  # should not raise
    assert payload["sampleSize"] == 4

    tiers = {entry["tier"]: entry["count"] for entry in payload["tiers"]}
    assert tiers == {"TIERA": 2, "TIERB": 1, "TIERC": 1}

    # top profiles preserve counts
    profile_counts = {
        (entry["model"], entry["os"]): entry["count"] for entry in payload["profiles"]
    }
    assert profile_counts[("VisionPro", "visionOS 1.2")] == 1
    assert profile_counts[("Galaxy Ultra", "Android 14")] == 1
    assert profile_counts[("Quest", "QuestOS 15")] == 1

    runtimes = {
        entry["runtime"]: entry["count"] for entry in payload["runtimeDistribution"]
    }
    assert runtimes == {"immersive": 1, "mobile": 1, "sim": 1, "desktop": 1}

    latency_entries = {
        (entry["model"], entry["os"]): entry for entry in payload["latencyP95"]
    }
    assert latency_entries[("VisionPro", "visionOS 1.2")]["p95"] == 45.0
    assert latency_entries[("Galaxy Ultra", "Android 14")]["p95"] == 60.0
    assert latency_entries[("Quest", "QuestOS 15")]["p95"] == pytest.approx(50.0)
    assert latency_entries[("AROne", "CustomOS")]["p95"] == pytest.approx(12.5)

    config_hashes = {entry["hash"]: entry["count"] for entry in payload["configHashes"]}
    assert config_hashes == {"hash-1": 1, "hash-2": 1}
