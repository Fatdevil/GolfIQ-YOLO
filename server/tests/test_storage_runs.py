from __future__ import annotations

import importlib
from dataclasses import asdict

import numpy as np
import pytest


@pytest.fixture
def runs_module(monkeypatch, tmp_path):
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))
    from server.storage import runs as runs_mod

    module = importlib.reload(runs_mod)
    yield module
    importlib.reload(runs_mod)


def test_save_and_load_run_round_trip(runs_module, monkeypatch):
    class DummyUUID:
        def __init__(self, value: str) -> None:
            self.hex = value

    monkeypatch.setattr(runs_module.time, "time", lambda: 1_700_000_000.0)
    monkeypatch.setattr(runs_module.uuid, "uuid4", lambda: DummyUUID("abcd1234efgh5678"))

    record = runs_module.save_run(
        source="app",
        mode="play",
        params={"club": "7i"},
        metrics={"carry": 150},
        events=[1, 2, 3],
    )
    loaded = runs_module.load_run(record.run_id)
    assert loaded == record


def test_load_run_returns_none_for_missing_file(runs_module):
    assert runs_module.load_run("1234567890-abcd1234") is None


def test_safe_blocks_directory_escape(runs_module, monkeypatch):
    monkeypatch.setattr(runs_module, "RUN_ID_RE", r".+")
    assert runs_module._safe("../outside") is None
    original_relative_to = runs_module.Path.relative_to

    def fake_relative_to(self, other):
        if self.name == "escape":
            raise ValueError
        return original_relative_to(self, other)

    monkeypatch.setattr(runs_module.Path, "relative_to", fake_relative_to)
    assert runs_module._safe("escape") is None


def test_list_runs_skips_invalid_and_limits(runs_module, tmp_path):
    valid_dir = tmp_path / "1234567890-abcd1234"
    valid_dir.mkdir()
    valid_record = runs_module.RunRecord(
        run_id="1234567890-abcd1234",
        created_ts=1.0,
        source="app",
        mode="play",
        params={},
        metrics={},
        events=[],
    )
    (valid_dir / "run.json").write_text(runs_module.json.dumps(asdict(valid_record)))

    invalid_dir = tmp_path / "1234567891-abcd1234"
    invalid_dir.mkdir()
    (invalid_dir / "run.json").write_text("{invalid}")

    runs = runs_module.list_runs(limit=1)
    assert [r.run_id for r in runs] == ["1234567890-abcd1234"]


def test_save_impact_frames_writes_numpy_arrays(runs_module):
    frame = np.zeros((2, 2))
    out = runs_module.save_impact_frames("1234567890-abcd1234", [frame, "bad"])
    assert out.endswith("impact_preview.zip")


def test_delete_run_handles_missing_directory(runs_module):
    assert runs_module.delete_run("1234567890-abcd1234") is False


def test_list_runs_returns_empty_when_root_missing(runs_module, monkeypatch, tmp_path):
    missing_root = tmp_path / "missing"
    monkeypatch.setattr(runs_module, "RUNS_DIR", missing_root)
    assert runs_module.list_runs() == []
