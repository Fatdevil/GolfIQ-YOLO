from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app


def _write_run_payload(root: Path, run_id: str, created_at: datetime, events: list[dict]) -> None:
    runs_dir = root
    hud_dir = runs_dir / "hud"
    by_id_dir = runs_dir / "by_id"
    hud_dir.mkdir(parents=True, exist_ok=True)
    by_id_dir.mkdir(parents=True, exist_ok=True)

    day_file = hud_dir / f"{created_at.strftime('%Y-%m-%d')}.jsonl"
    entry = {
        "id": run_id,
        "kind": "hud",
        "created_at": created_at.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "device": "test-device",
        "url": f"/runs/{run_id}",
        "size": 123,
    }
    with day_file.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")

    by_id_path = by_id_dir / f"{run_id}.json"
    by_id_path.write_text(json.dumps(events), encoding="utf-8")


@pytest.mark.parametrize("since", [None, "24h"])
def test_caddie_health_snapshot(monkeypatch, tmp_path, since):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))
    now = datetime.now(timezone.utc)
    events = [
        {
            "timestampMs": 0,
            "event": "hud.caddie.plan",
            "data": {
                "club": "7I",
                "risk": 0.25,
                "aimDeg": 2.0,
                "D": 150.0,
                "mode": "approach",
                "mcUsed": True,
                "adviceText": ["+1 club", "80% tempo"],
            },
        },
        {
            "timestampMs": 1,
            "event": "hud.caddie.mc",
            "data": {
                "samples": 800,
                "pFairway": 0.62,
                "pHazard": 0.18,
                "expLongMiss_m": 0.4,
                "expLatMiss_m": -0.15,
            },
        },
        {
            "timestampMs": 2,
            "event": "hud.caddie.tts",
            "data": {"chars": 48},
        },
        {
            "timestampMs": 3,
            "event": "hud.caddie.adopt",
            "data": {"adopted": True, "mcUsed": True, "hadAdvice": True},
        },
    ]
    _write_run_payload(tmp_path, "run-001", now, events)

    client = TestClient(app)
    params = {"since": since} if since else {}
    response = client.get("/caddie/health", params=params)

    assert response.status_code == 200
    payload = response.json()
    assert "since" in payload
    assert payload["mc"]["enabledPct"] == pytest.approx(100.0)
    assert payload["mc"]["hazardRate"] == pytest.approx(0.18)
    assert payload["mc"]["fairwayRate"] == pytest.approx(0.62)
    assert payload["mc"]["avgLongErr"] == pytest.approx(0.4)
    assert payload["mc"]["avgLatErr"] == pytest.approx(-0.15)
    assert payload["mc"]["adoptRate"] == pytest.approx(1.0)
    assert payload["advice"]["adoptRate"] == pytest.approx(1.0)
    assert payload["advice"]["topAdvice"][0] == "+1 club"
    assert payload["advice"]["topAdvice"][1] == "80% tempo"
    assert payload["tts"]["playRate"] == pytest.approx(1.0)
    assert payload["tts"]["avgChars"] == pytest.approx(48.0)
