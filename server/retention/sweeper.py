from __future__ import annotations
import time, os
from pathlib import Path
from typing import Iterable, List

def sweep_retention_once(dirs: Iterable[str] | None, minutes: int) -> List[str]:
    """
    Delete files older than `minutes` in each dir; returns deleted file paths.
    If minutes <= 0, delete anything older than now (i.e., everything).
    Robust mot saknade mappar och tillfälliga filsystemfel.
    """
    deleted: List[str] = []
    if not dirs:
        return deleted

    cutoff = time.time() if minutes <= 0 else (time.time() - minutes * 60)

    for d in dirs:
        p = Path(d)
        if not p.is_dir():
            continue
        for f in p.rglob("*"):
            try:
                if f.is_file() and f.stat().st_mtime < cutoff:
                    f.unlink(missing_ok=True)
                    deleted.append(str(f))
            except Exception:
                # Ignorera t.ex. permission errors eller race-conditions
                pass
    return deleted

