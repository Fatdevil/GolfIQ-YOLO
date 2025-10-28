import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app


def _write_run(
    root: Path, run_id: str, created_at: datetime, events: list[dict]
) -> None:
    runs_dir = root
    hud_dir = runs_dir / "hud"
    by_id_dir = runs_dir / "by_id"
    hud_dir.mkdir(parents=True, exist_ok=True)
    by_id_dir.mkdir(parents=True, exist_ok=True)

    day_file = hud_dir / f"{created_at.strftime('%Y-%m-%d')}.jsonl"
    entry = {
        "id": run_id,
        "kind": "hud",
        "created_at": created_at.replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "device": "test-device",
        "url": f"/runs/{run_id}",
        "size": 123,
    }
    mode = "a" if day_file.exists() else "w"
    with day_file.open(mode, encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")

    by_id_path = by_id_dir / f"{run_id}.json"
    by_id_path.write_text(json.dumps(events), encoding="utf-8")


def test_caddie_health_ab_breakdown(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))
    now = datetime.now(timezone.utc)

    control_events = [
        {
            "timestampMs": 0,
            "event": "hud.caddie.rollout",
            "data": {"mc": False, "advice": False, "tts": False},
        },
        {
            "timestampMs": 1,
            "event": "hud.caddie.plan",
            "data": {
                "mcUsed": False,
                "hadAdvice": False,
                "ttsUsed": False,
                "adviceText": [],
            },
        },
        {
            "timestampMs": 3,
            "event": "hud.caddie.adopt",
            "data": {
                "adopted": False,
                "mcUsed": False,
                "hadAdvice": False,
                "ttsUsed": False,
            },
        },
        {
            "timestampMs": 5,
            "event": "hud.shot",
            "data": {
                "sg": {"total": 0.1},
                "planAdopted": False,
                "rollout": {"mc": False, "advice": False, "tts": False},
            },
        },
    ]

    enforced_events = [
        {
            "timestampMs": 0,
            "event": "hud.caddie.rollout",
            "data": {"mc": True, "advice": True, "tts": True},
        },
        {
            "timestampMs": 1,
            "event": "hud.caddie.plan",
            "data": {
                "mcUsed": True,
                "hadAdvice": True,
                "ttsUsed": True,
                "adviceText": ["Grip it and rip it"],
            },
        },
        {
            "timestampMs": 2,
            "event": "hud.caddie.tts",
            "data": {"chars": 64},
        },
        {
            "timestampMs": 3,
            "event": "hud.caddie.adopt",
            "data": {
                "adopted": True,
                "mcUsed": True,
                "hadAdvice": True,
                "ttsUsed": True,
            },
        },
        {
            "timestampMs": 5,
            "event": "hud.shot",
            "data": {
                "sg": {"total": 0.6},
                "planAdopted": True,
                "rollout": {"mc": True, "advice": True, "tts": True},
            },
        },
    ]

    _write_run(tmp_path, "run-control", now, control_events)
    _write_run(tmp_path, "run-enforced", now, enforced_events)

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "24h"})
    assert response.status_code == 200
    payload = response.json()

    mc_ab = payload["mc"]["ab"]
    advice_ab = payload["advice"]["ab"]
    tts_ab = payload["tts"]["ab"]

    assert mc_ab["control"]["plans"] == 1
    assert mc_ab["control"]["adopts"] == 0
    assert mc_ab["control"]["rounds"] == 1
    assert mc_ab["control"]["sg_total"] == pytest.approx(0.1)

    assert mc_ab["enforced"]["plans"] == 1
    assert mc_ab["enforced"]["adopts"] == 1
    assert mc_ab["enforced"]["rounds"] == 1
    assert mc_ab["enforced"]["sg_total"] == pytest.approx(0.6)
    assert mc_ab["delta"]["adoptRate"] > 0

    assert advice_ab["control"]["plans"] == 1
    assert advice_ab["enforced"]["adopts"] == 1
    assert advice_ab["delta"]["sgPerRound"] > 0

    assert tts_ab["control"]["plans"] == 1
    assert tts_ab["control"]["plays"] == 0
    assert tts_ab["enforced"]["plans"] == 1
    assert tts_ab["enforced"]["plays"] == 1
    assert tts_ab["delta"]["playRate"] > 0

    assert payload["mc"]["enabledPct"] == pytest.approx(50.0)
    assert payload["mc"]["adoptRate"] == pytest.approx(1.0)
    assert payload["advice"]["adoptRate"] == pytest.approx(1.0)
    assert payload["tts"]["playRate"] == pytest.approx(0.5)
