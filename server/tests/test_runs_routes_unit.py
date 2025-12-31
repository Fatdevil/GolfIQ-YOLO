from types import SimpleNamespace

import pytest

from server.routes import runs


def test_get_runs_maps_records(monkeypatch):
    records = [
        SimpleNamespace(
            run_id="r1",
            created_ts=123.0,
            updated_ts=123.0,
            source="mock",
            source_type="analyze",
            status=runs.RunStatus.SUCCEEDED,
            model_variant_selected="yolov10",
            override_source="none",
            inference_timing={"total_ms": 10.0},
            created_at="2024-01-01T00:00:00+00:00",
            updated_at="2024-01-01T00:00:01+00:00",
        )
    ]
    monkeypatch.setattr(runs, "list_runs", lambda limit, offset=0: records)

    items = runs.get_runs()
    assert len(items) == 1
    assert items[0].run_id == "r1"
    assert items[0].status == runs.RunStatus.SUCCEEDED
    assert items[0].model_variant_selected == "yolov10"


def test_get_run_returns_payload(monkeypatch):
    record = SimpleNamespace(
        run_id="r2",
        created_ts=234.0,
        updated_ts=234.0,
        source="mock",
        source_type="analyze",
        mode="tracks",
        params={"mode": "tracks"},
        metrics={"confidence": 0.8},
        events=[1, 2],
        impact_preview="preview.mp4",
        status=runs.RunStatus.SUCCEEDED,
        model_variant_requested=None,
        model_variant_selected="yolov10",
        override_source="none",
        inference_timing={"total_ms": 1.0},
        error_code=None,
        error_message=None,
        input_ref=None,
        metadata={},
        created_at="2024-01-02T00:00:00+00:00",
        updated_at="2024-01-02T00:00:01+00:00",
    )
    monkeypatch.setattr(runs, "load_run", lambda run_id: record)

    payload = runs.get_run("r2")
    assert payload["run_id"] == "r2"
    assert payload["impact_preview"] == "preview.mp4"
    assert payload["status"] == runs.RunStatus.SUCCEEDED


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
