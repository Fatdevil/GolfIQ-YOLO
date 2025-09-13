from __future__ import annotations

import logging
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

    logger = logging.getLogger(__name__)

    for d in dirs or []:
        try:
            for f in Path(d).rglob("*"):
                if f.is_file() and (cutoff is None or f.stat().st_mtime < cutoff):
                    f.unlink(missing_ok=True)
                    deleted.append(str(f))
        except OSError as exc:
            # Robust mot saknade mappar och tillfälliga filsystemfel
            logger.warning("Failed to sweep %s: %s", d, exc)

    return deleted
