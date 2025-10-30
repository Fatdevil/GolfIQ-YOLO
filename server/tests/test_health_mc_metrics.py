import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app


def _write_run(root: Path, run_id: str, events: list[dict]) -> None:
    runs_dir = root
    hud_dir = runs_dir / "hud"
    by_id_dir = runs_dir / "by_id"
    hud_dir.mkdir(parents=True, exist_ok=True)
    by_id_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc).replace(microsecond=0)
    hud_path = hud_dir / f"{now.strftime('%Y-%m-%d')}.jsonl"
    entry = {
        "id": run_id,
        "kind": "hud",
        "created_at": now.isoformat().replace("+00:00", "Z"),
        "device": "test-device",
        "url": f"/runs/{run_id}",
        "size": 128,
    }
    with hud_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")

    by_id_path = by_id_dir / f"{run_id}.json"
    by_id_path.write_text(json.dumps(events), encoding="utf-8")


def test_health_mc_metrics_breakdowns(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))

    enforced_events = [
        {
            "event": "hud.caddie.rollout",
            "data": {"mc": True, "advice": False, "tts": False},
        },
        {
            "event": "hud.caddie.plan",
            "data": {
                "club": "DRIVER",
                "mcUsed": True,
                "hadAdvice": False,
                "ttsUsed": False,
            },
        },
        {
            "event": "hud.caddie.mc",
            "data": {
                "samples": 600,
                "hazardRate": 0.2,
                "successRate": 0.6,
                "ev": 0.32,
                "expectedLongMiss_m": 0.3,
                "expectedLatMiss_m": -0.2,
                "kind": "tee",
            },
        },
        {
            "event": "hud.caddie.mc",
            "data": {
                "samples": 600,
                "hazardRate": 0.15,
                "successRate": 0.7,
                "ev": 0.4,
                "expectedLongMiss_m": -0.1,
                "expectedLatMiss_m": -0.05,
                "kind": "approach",
            },
        },
    ]

    control_events = [
        {
            "event": "hud.caddie.rollout",
            "data": {"mc": False, "advice": False, "tts": False},
        },
        {
            "event": "hud.caddie.plan",
            "data": {
                "club": "5I",
                "mcUsed": False,
                "hadAdvice": False,
                "ttsUsed": False,
            },
        },
        {
            "event": "hud.caddie.mc",
            "data": {
                "samples": 600,
                "hazardRate": 0.4,
                "successRate": 0.5,
                "ev": 0.1,
                "expectedLongMiss_m": 0.6,
                "expectedLatMiss_m": 0.2,
                "kind": "tee",
            },
        },
    ]

    _write_run(tmp_path, "run-enforced", enforced_events)
    _write_run(tmp_path, "run-control", control_events)

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "12h"})
    assert response.status_code == 200

    payload = response.json()
    mc = payload["mc"]

    overall_hazard = (0.2 + 0.15 + 0.4) / 3
    assert mc["hazardRate"] == pytest.approx(overall_hazard)
    assert mc["hazardRateTee"] == pytest.approx((0.2 + 0.4) / 2)
    assert mc["hazardRateApproach"] == pytest.approx(0.15)
    assert mc["fairwayRate"] == pytest.approx((0.6 + 0.7 + 0.5) / 3)
    assert mc["avgLongErr"] == pytest.approx((0.3 - 0.1 + 0.6) / 3)
    assert mc["avgLatErr"] == pytest.approx((-0.2 - 0.05 + 0.2) / 3)

    ev_enforced = (0.32 + 0.4) / 2
    ev_control = 0.1
    assert mc["evLift"] == pytest.approx(ev_enforced - ev_control)


def test_health_mc_metrics_weighted_rates(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))

    events = [
        {
            "event": "hud.caddie.rollout",
            "data": {"mc": True, "advice": False, "tts": False},
        },
        {
            "event": "hud.caddie.plan",
            "data": {"mcUsed": True, "hadAdvice": False, "ttsUsed": False},
        },
        {
            "event": "hud.caddie.mc",
            "data": {
                "samples": 10,
                "hazardRate": 0.8,
                "successRate": 0.3,
                "expectedLongMiss_m": 2.0,
                "expectedLatMiss_m": -1.0,
                "ev": 0.1,
                "kind": "tee",
            },
        },
        {
            "event": "hud.caddie.mc",
            "data": {
                "samples": 90,
                "hazardRate": 0.2,
                "successRate": 0.9,
                "expectedLongMiss_m": 0.0,
                "expectedLatMiss_m": 0.5,
                "ev": 0.6,
                "kind": "approach",
            },
        },
    ]

    _write_run(tmp_path, "run-weighted", events)

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "2h"})
    assert response.status_code == 200

    mc = response.json()["mc"]

    assert mc["hazardRate"] == pytest.approx(0.26)
    assert mc["hazardRateTee"] == pytest.approx(0.8)
    assert mc["hazardRateApproach"] == pytest.approx(0.2)
    assert mc["fairwayRate"] == pytest.approx(0.84)
    assert mc["avgLongErr"] == pytest.approx(0.2)
    assert mc["avgLatErr"] == pytest.approx(0.35)


def test_health_mc_metrics_empty(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "6h"})
    assert response.status_code == 200
    payload = response.json()
    mc = payload["mc"]
    assert mc["hazardRate"] == 0.0
    assert mc["hazardRateTee"] == 0.0
    assert mc["hazardRateApproach"] == 0.0
    assert mc["evLift"] == 0.0
