import os
import sys
import time
from pathlib import Path

sys.modules.pop("server", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from server.retention.sweeper import sweep_retention_once  # noqa: E402


def touch(p: Path, age: int = 0) -> None:
    p.write_text("x")
    if age:
        past = time.time() - age
        os.utime(p, (past, past))


def test_deletes_old_keeps_new(tmp_path: Path) -> None:
    old_file = tmp_path / "old.txt"
    new_file = tmp_path / "new.txt"
    touch(old_file, age=3600)
    touch(new_file)
    deleted = sweep_retention_once([str(tmp_path)], minutes=1)
    assert str(old_file) in deleted
    assert new_file.exists()


def test_minutes_zero_deletes_all(tmp_path: Path) -> None:
    f1 = tmp_path / "a.txt"
    f2 = tmp_path / "b.txt"
    f1.write_text("x")
    f2.write_text("x")
    deleted = sweep_retention_once([str(tmp_path)], minutes=0)
    assert set(deleted) == {str(f1), str(f2)}


def test_missing_dir_is_ok(tmp_path: Path) -> None:
    missing = tmp_path / "nope"
    assert sweep_retention_once([str(missing)], minutes=1) == []
