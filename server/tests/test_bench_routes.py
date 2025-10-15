from __future__ import annotations

import importlib
import json
from datetime import datetime
from pathlib import Path
from typing import Tuple

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


API_KEY = "super-secret"


def _make_client(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Tuple[TestClient, object, Path, Path]:
    runs_path = tmp_path / "edge_runs.jsonl"
    defaults_path = tmp_path / "edge_defaults.json"

    monkeypatch.setenv("EDGE_BENCH_RUNS_PATH", str(runs_path))
    monkeypatch.setenv("EDGE_DEFAULTS_PATH", str(defaults_path))
    monkeypatch.setenv("EDGE_BENCH_RECENT", "5")
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", API_KEY)

    from server.routes import bench as bench_module

    importlib.reload(bench_module)

    app = FastAPI()
    app.include_router(bench_module.router)
    client = TestClient(app)
    return client, bench_module, runs_path, defaults_path


@pytest.mark.parametrize("missing_header", [True, False])
def test_submit_edge_bench_persists_record(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, missing_header: bool
) -> None:
    client, bench_module, runs_path, _defaults_path = _make_client(
        monkeypatch, tmp_path
    )

    payload = {
        "device": "Pixel QA",
        "os": "Android 15",
        "appVersion": "0.1.0",
        "platform": "android",
        "runtime": "tflite",
        "inputSize": 320,
        "quant": "int8",
        "threads": 4,
        "delegate": "nnapi",
        "fps": 48.5,
        "p95": 34.2,
        "ts": "2024-01-01T00:00:00Z",
    }

    headers = {"x-api-key": API_KEY} if not missing_header else {}
    response = client.post("/bench/edge", json=payload, headers=headers)

    if missing_header:
        assert response.status_code == 401
        assert not runs_path.exists()
        return

    assert response.status_code == 201
    assert runs_path.exists()

    contents = runs_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(contents) == 1

    stored = json.loads(contents[0])
    assert stored["device"] == "Pixel QA"
    assert stored["runtime"] == "tflite"
    assert stored["inputSize"] == 320
    assert stored["dryRun"] is False
    assert stored["delegate"] == "nnapi"
    assert "receivedAt" in stored
    datetime.fromisoformat(stored["ts"])  # should parse without error


def test_submit_rejects_invalid_payload(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _bench_module, runs_path, _defaults_path = _make_client(
        monkeypatch, tmp_path
    )

    payload = {
        "device": "Pixel QA",
        "os": "Android 15",
        "appVersion": "0.1.0",
        "platform": "windows",
        "runtime": "tflite",
        "inputSize": 320,
        "quant": "int8",
        "threads": 4,
        "fps": 48.5,
        "p95": 34.2,
        "ts": "2024-01-01T00:00:00Z",
    }

    response = client.post("/bench/edge", json=payload, headers={"x-api-key": API_KEY})
    assert response.status_code == 422
    assert not runs_path.exists()


def test_summary_uses_recommend_defaults(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, bench_module, runs_path, defaults_path = _make_client(monkeypatch, tmp_path)

    sentinel = {
        "android": {
            "runtime": "tflite",
            "inputSize": 320,
            "quant": "int8",
            "threads": 4,
        }
    }
    captured_args = {}

    def _fake_recommend(runs: Path, output: Path, recent: int):
        captured_args["runs"] = runs
        captured_args["output"] = output
        captured_args["recent"] = recent
        defaults_path.write_text(json.dumps(sentinel), encoding="utf-8")
        return sentinel

    monkeypatch.setattr(bench_module, "recommend_defaults", _fake_recommend)

    response = client.get("/bench/summary", headers={"x-api-key": API_KEY})
    assert response.status_code == 200
    assert response.json() == sentinel
    assert captured_args["runs"] == runs_path.resolve()
    assert captured_args["output"] == defaults_path.resolve()
    assert captured_args["recent"] == 5
