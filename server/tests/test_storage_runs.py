from __future__ import annotations

from typing import Tuple

from server.storage import runs as runs_storage


def _setup_runs_dir(tmp_path, monkeypatch) -> Tuple[str, str]:
    runs_dir = (tmp_path / "runs").resolve()
    monkeypatch.setattr(runs_storage, "RUNS_DIR", runs_dir)
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(runs_dir))
    return str(runs_dir), "1234567890-deadbeef"


def test_save_and_load_round_trip(tmp_path, monkeypatch):
    _setup_runs_dir(tmp_path, monkeypatch)

    record = runs_storage.save_run(
        source="unit-test",
        mode="mock",
        params={"frames": 4},
        metrics={"ball_speed_mps": 1.0},
        events=[1, 2],
    )

    loaded = runs_storage.load_run(record.run_id)

    assert loaded is not None
    assert loaded.run_id == record.run_id
    assert loaded.events == [1, 2]

    run_ids = [r.run_id for r in runs_storage.list_runs()]
    assert record.run_id in run_ids


def test_delete_run_missing_directory(tmp_path, monkeypatch):
    _, run_id = _setup_runs_dir(tmp_path, monkeypatch)

    assert runs_storage.delete_run(run_id) is False


def test_list_runs_without_directory(tmp_path, monkeypatch):
    _setup_runs_dir(tmp_path, monkeypatch)

    assert runs_storage.list_runs() == []
