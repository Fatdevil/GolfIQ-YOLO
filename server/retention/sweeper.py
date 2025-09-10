import pathlib
import time
from typing import Iterable, List


def sweep_retention_once(dirs: Iterable[str], minutes: int) -> List[str]:
    """Delete files older than 'minutes' in each dir; returns deleted paths."""
    deleted: List[str] = []
    if minutes <= 0:  # treat 0 as delete everything older than now
        cutoff = time.time()
    else:
        cutoff = time.time() - minutes * 60
    for d in dirs or []:
        p = pathlib.Path(d)
        if not p.exists() or not p.is_dir():
            continue
        for f in p.rglob("*"):
            if not f.is_file():
                continue
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink(missing_ok=True)
                    deleted.append(str(f))
            except Exception:
                pass
    return deleted
