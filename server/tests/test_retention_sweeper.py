import os
import pathlib
import time

from server.retention.sweeper import sweep_retention_once


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
