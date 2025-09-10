import os
import time
import pathlib
from typing import Iterable, List


def sweep_retention_once(dirs: Iterable[str], minutes: int) -> List[str]:
    deleted = []
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
                    pass
    return deleted
