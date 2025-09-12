import os
import time
from pathlib import Path

from server.retention.sweeper import sweep_retention_once


def _touch(p: Path, age_seconds: int = 0):
    p.write_text("x")
    if age_seconds:
        past = time.time() - age_seconds
        os.utime(p, (past, past))


def test_deletes_old_keeps_new(tmp_path: Path):
    oldf = tmp_path / "old.txt"
    newf = tmp_path / "new.txt"
    _touch(oldf, age_seconds=3600)  # 1 timme gammal
    _touch(newf, age_seconds=10)  # ny
    deleted = sweep_retention_once([str(tmp_path)], minutes=1)
    assert str(oldf) in deleted
    assert newf.exists()


def test_minutes_zero_deletes_all(tmp_path: Path):
    f1 = tmp_path / "a.txt"
    f1.write_text("x")
    f2 = tmp_path / "b.txt"
    f2.write_text("x")
    deleted = sweep_retention_once([str(tmp_path)], minutes=0)
    assert str(f1) in deleted and str(f2) in deleted


def test_missing_dir_is_ok(tmp_path: Path):
    missing = tmp_path / "nope"
    out = sweep_retention_once([str(missing)], minutes=1)
    assert out == []
