from types import SimpleNamespace

import pytest

from server.routes import runs


def test_get_runs_maps_records(monkeypatch):
    records = [
        SimpleNamespace(
            run_id="r1",
            created_ts=123.0,
            source="mock",
            mode="detector",
            metrics={"confidence": 0.9, "ball_speed_mps": 45.0},
        )
    ]
    monkeypatch.setattr(runs, "list_runs", lambda limit: records)

    items = runs.get_runs()
    assert len(items) == 1
    assert items[0].confidence == 0.9
    assert items[0].ball_speed_mps == 45.0


def test_get_run_returns_payload(monkeypatch):
    record = SimpleNamespace(
        run_id="r2",
        created_ts=234.0,
        source="mock",
        mode="tracks",
        params={"mode": "tracks"},
        metrics={"confidence": 0.8},
        events=[1, 2],
        impact_preview="preview.mp4",
    )
    monkeypatch.setattr(runs, "load_run", lambda run_id: record)

    payload = runs.get_run("r2")
    assert payload["run_id"] == "r2"
    assert payload["impact_preview"] == "preview.mp4"


def test_get_run_missing(monkeypatch):
    monkeypatch.setattr(runs, "load_run", lambda run_id: None)
    with pytest.raises(Exception):
        runs.get_run("missing")


def test_delete_run_handles_missing(monkeypatch):
    monkeypatch.setattr(runs, "delete_run", lambda run_id: False)
    with pytest.raises(Exception):
        runs.delete("missing")


def test_delete_run_success(monkeypatch):
    monkeypatch.setattr(runs, "delete_run", lambda run_id: True)
    result = runs.delete("r3")
    assert result == {"deleted": "r3"}
