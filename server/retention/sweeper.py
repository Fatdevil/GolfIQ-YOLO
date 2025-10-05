from __future__ import annotations

import time
from pathlib import Path
from typing import Iterable, List


def sweep_retention_once(dirs: Iterable[str] | None, minutes: int) -> List[str]:
    """Delete files older than ``minutes`` in each directory.

    ``minutes=0`` deletes all files. Returns the paths of deleted files and
    ignores any filesystem errors silently.
    """

    deleted: List[str] = []
    cutoff = None if minutes <= 0 else time.time() - minutes * 60

    for d in dirs or []:
        try:
            for f in Path(d).rglob("*"):
                if f.is_file() and (cutoff is None or f.stat().st_mtime < cutoff):
                    f.unlink(missing_ok=True)
                    deleted.append(str(f))
        except Exception:
            # Robust mot saknade mappar och tillfälliga filsystemfel
            pass

    return deleted


def sweep_upload_retention(upload_root: str | Path, ttl_days: int) -> List[str]:
    """Delete run upload artifacts older than ``ttl_days`` days."""

    if ttl_days <= 0:
        return []

    root = Path(upload_root)
    if not root.exists():
        return []

    cutoff = time.time() - ttl_days * 24 * 60 * 60
    deleted: List[str] = []

    for path in root.rglob("*"):
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
                deleted.append(str(path))
        except Exception:
            pass

    # Clean up empty directories after pruning files
    for directory in sorted((p for p in root.rglob("*") if p.is_dir()), reverse=True):
        try:
            if not any(directory.iterdir()):
                directory.rmdir()
        except Exception:
            pass

    return deleted
