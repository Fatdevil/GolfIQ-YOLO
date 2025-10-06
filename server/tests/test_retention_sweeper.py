import os
import time
from pathlib import Path

from server.retention import sweeper


def touch(path: Path, *, age_seconds: int = 0) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("stub")
    if age_seconds:
        past = time.time() - age_seconds
        os.utime(path, (past, past))
    return path


def test_sweep_retention_once_drops_old_files(tmp_path):
    recent = touch(tmp_path / "recent.txt")
    old = touch(tmp_path / "old.txt", age_seconds=600)

    deleted = sweeper.sweep_retention_once([str(tmp_path)], minutes=5)

    assert str(old) in deleted
    assert str(recent) not in deleted
    assert recent.exists()


def test_sweep_retention_once_handles_missing_directory(tmp_path):
    missing = tmp_path / "missing"
    deleted = sweeper.sweep_retention_once([str(missing)], minutes=5)
    assert deleted == []


def test_sweep_retention_once_minutes_zero_deletes_all(tmp_path):
    first = touch(tmp_path / "a.txt", age_seconds=30)
    second = touch(tmp_path / "b.txt")

    deleted = sweeper.sweep_retention_once([str(tmp_path)], minutes=0)

    assert {str(first), str(second)} == set(deleted)
    assert not any(p.exists() for p in (first, second))


def test_sweep_retention_once_ignores_errors(monkeypatch, tmp_path):
    folder = tmp_path / "errs"
    folder.mkdir()

    def boom(self, pattern):
        raise OSError("boom")

    monkeypatch.setattr(Path, "rglob", boom)
    assert sweeper.sweep_retention_once([str(folder)], minutes=5) == []


def test_sweep_upload_retention_prunes_files_and_empty_directories(tmp_path):
    upload_root = tmp_path / "uploads"
    nested = upload_root / "runs" / "abc"
    kept_file = touch(nested / "keep.zip", age_seconds=60)
    old_file = touch(nested / "old.zip", age_seconds=10 * 24 * 60 * 60)

    deleted = sweeper.sweep_upload_retention(upload_root, ttl_days=1)

    assert str(old_file) in deleted
    assert kept_file.exists()
    assert not old_file.exists()
    # Directory containing kept file should remain
    assert nested.exists()


def test_sweep_upload_retention_handles_unlink_errors(monkeypatch, tmp_path):
    upload_root = tmp_path / "uploads"
    failing = touch(upload_root / "old.zip", age_seconds=10 * 24 * 60 * 60)

    original_unlink = Path.unlink

    def flaky_unlink(self, *args, **kwargs):
        if self == failing:
            raise OSError("cannot delete")
        return original_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", flaky_unlink)

    deleted = sweeper.sweep_upload_retention(upload_root, ttl_days=1)

    assert deleted == []
    assert failing.exists()


def test_sweep_upload_retention_noop_for_disabled(tmp_path):
    upload_root = tmp_path / "uploads"
    stale = touch(upload_root / "old.zip", age_seconds=10 * 24 * 60 * 60)

    deleted = sweeper.sweep_upload_retention(upload_root, ttl_days=0)

    assert deleted == []
    assert stale.exists()


def test_sweep_upload_retention_ignores_rmdir_errors(monkeypatch, tmp_path):
    upload_root = tmp_path / "uploads"
    old_dir = upload_root / "runs" / "old"
    touch(old_dir / "old.zip", age_seconds=10 * 24 * 60 * 60)

    original_rmdir = Path.rmdir

    def flaky_rmdir(self):
        if self == old_dir:
            raise OSError("cannot remove")
        return original_rmdir(self)

    monkeypatch.setattr(Path, "rmdir", flaky_rmdir)

    deleted = sweeper.sweep_upload_retention(upload_root, ttl_days=1)

    assert str(old_dir / "old.zip") in deleted
    assert old_dir.exists()
