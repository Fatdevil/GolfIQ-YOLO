import os
import pathlib
import sys
import time

# Add server package root to path for direct imports
sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from retention.sweeper import sweep_retention_once  # noqa: E402


def test_sweeper_deletes_old_files(tmp_path: pathlib.Path):
    oldf = tmp_path / "old.txt"
    newf = tmp_path / "new.txt"
    oldf.write_text("x")
    newf.write_text("y")
    past = time.time() - 3600
    os.utime(oldf, (past, past))
    deleted = sweep_retention_once([str(tmp_path)], minutes=1)
    assert str(oldf) in deleted
    assert newf.exists()
