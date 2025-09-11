import pathlib
import time
from typing import Iterable, List


def sweep_retention_once(dirs: Iterable[str], minutes: int) -> List[str]:
    """Delete files older than `minutes` in each dir; returns deleted file paths.
    If minutes <= 0, delete anything older than now (i.e., everything in those dirs).
    """
    deleted: List[str] = []
    cutoff = time.time() - minutes * 60 if minutes > 0 else time.time()

    for d in dirs or []:
        p = pathlib.Path(d)
        if not p.exists() or not p.is_dir():
            continue

        for f in p.rglob("*"):
            if f.is_file() and f.stat().st_mtime < cutoff:
                try:
                    f.unlink(missing_ok=True)
                    deleted.append(str(f))
                except Exception:
                    # ignore transient filesystem errors
                    pass

    return deleted
