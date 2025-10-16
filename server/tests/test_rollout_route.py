import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app


@pytest.fixture
def flight_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(tmp_path))
    return tmp_path


def _write_jsonl(path: Path, events) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for event in events:
            handle.write(json.dumps(event) + "\n")


def test_rollout_health_defaults_when_no_data(flight_dir):
    client = TestClient(app)
    response = client.get("/rollout/health")
    assert response.status_code == 200
    payload = response.json()
    # since is an ISO string
    datetime.fromisoformat(payload["since"])
    assert payload["android"]["control"] == {"p95Latency": 0.0, "fpsAvg": 0.0}
    assert payload["android"]["enforced"] == {"p95Latency": 0.0, "fpsAvg": 0.0}
    assert payload["android"]["breach"] is False
    assert payload["ios"]["control"] == {"p95Latency": 0.0, "fpsAvg": 0.0}
    assert payload["ios"]["enforced"] == {"p95Latency": 0.0, "fpsAvg": 0.0}
    assert payload["ios"]["breach"] is False


def test_rollout_health_computes_metrics_and_breach(flight_dir):
    recent = datetime.now(timezone.utc) - timedelta(hours=1)
    older = datetime.now(timezone.utc) - timedelta(hours=48)

    latest = flight_dir / "flight-20240510.jsonl"
    older_file = flight_dir / "flight-20240509.jsonl"

    _write_jsonl(
        older_file,
        [
            {
                "timestamp": older.isoformat(),
                "payload": {
                    "rollout": {"enforced": True, "percent": 10, "kill": False},
                    "device": {"platform": "android"},
                    "metrics": {"latencyP95Ms": 999, "fpsAvg": 10},
                },
            }
        ],
    )

    _write_jsonl(
        latest,
        [
            {
                "timestamp": recent.isoformat(),
                "payload": {
                    "rollout": {"enforced": False, "percent": 50, "kill": False},
                    "device": {"platform": "android", "os": "Android 14"},
                    "metrics": {"latencyP95Ms": 110, "fpsAvg": 31},
                    "platform": "android",
                },
            },
            {
                "timestamp": recent.isoformat(),
                "payload": {
                    "rollout": {"enforced": True, "percent": 50, "kill": False},
                    "device": {"platform": "android", "os": "Android 14"},
                    "metrics": {"latencyP95Ms": 150, "fpsAvg": 25},
                    "platform": "android",
                },
            },
            {
                "timestamp": recent.isoformat(),
                "payload": {
                    "rollout": {"enforced": True, "percent": 50, "kill": False},
                    "device": {"platform": "ios", "os": "iOS 17"},
                    "metrics": {"latencyP95Ms": 95, "fpsAvg": 30},
                    "platform": "ios",
                },
            },
        ],
    )

    client = TestClient(app)
    response = client.get("/rollout/health?since=24h")
    assert response.status_code == 200
    payload = response.json()

    since_dt = datetime.fromisoformat(payload["since"])
    assert since_dt.tzinfo is not None

    android = payload["android"]
    assert android["control"] == {"p95Latency": 110.0, "fpsAvg": 31.0}
    assert android["enforced"] == {"p95Latency": 150.0, "fpsAvg": 25.0}
    assert android["breach"] is True

    ios = payload["ios"]
    assert ios["enforced"] == {"p95Latency": 95.0, "fpsAvg": 30.0}
    assert ios["breach"] is False
