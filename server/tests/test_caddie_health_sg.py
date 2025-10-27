from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app


def _write_run(root: Path, run_id: str, created_at: datetime, events: list[dict]) -> None:
    hud_dir = root / "hud"
    by_id_dir = root / "by_id"
    hud_dir.mkdir(parents=True, exist_ok=True)
    by_id_dir.mkdir(parents=True, exist_ok=True)

    hud_entry = {
        "id": run_id,
        "kind": "hud",
        "created_at": created_at.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "device": "test-device",
    }
    hud_path = hud_dir / f"{created_at.strftime('%Y-%m-%d')}.jsonl"
    with hud_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(hud_entry) + "\n")

    (by_id_dir / f"{run_id}.json").write_text(json.dumps(events), encoding="utf-8")


def test_caddie_health_includes_sg_totals(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))
    now = datetime.now(timezone.utc)

    _write_run(
        tmp_path,
        "run-1",
        now,
        [
            {
                "event": "hud.shot",
                "data": {"sg": {"total": 0.3}, "planAdopted": True},
            },
            {
                "event": "hud.shot",
                "data": {"sg": {"total": -0.1}, "planAdopted": False},
            },
        ],
    )
    _write_run(
        tmp_path,
        "run-2",
        now,
        [
            {
                "event": "hud.shot",
                "data": {"sg": {"total": -0.2}, "planAdopted": False},
            }
        ],
    )

    client = TestClient(app)
    response = client.get("/caddie/health")

    assert response.status_code == 200
    payload = response.json()

    sg_section = payload["sg_gained_per_round"]
    assert sg_section["sample"] == 2
    assert sg_section["mean"] == pytest.approx(0.0)
    assert sg_section["median"] == pytest.approx(0.0)

    lift = payload["adoption_sg_lift"]
    assert lift == pytest.approx(0.45)
