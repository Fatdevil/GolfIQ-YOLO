from __future__ import annotations

import importlib
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

_ALIAS = {
    "bytetrack": "bytetrack",
    "byte": "bytetrack",
    "bt": "bytetrack",
    "sort": "sort",
}


def _norm(name: str | None) -> str:
    if not name:
        return "bytetrack"
    return _ALIAS.get(str(name).strip().lower(), "invalid")


def get_tracker(name: str | None = None) -> Any:
    """
    Returnerar en trackerklass enligt name eller env GOLFIQ_TRACKER.
    Importerar *lazy* för att undvika tunga beroenden i testmiljön.
    Om ogiltig -> varning + fallback till ByteTrack.
    """
    chosen = _norm(name or os.getenv("GOLFIQ_TRACKER"))
    if chosen == "invalid":
        bad = os.getenv("GOLFIQ_TRACKER")
        log.warning("Unknown GOLFIQ_TRACKER=%r, falling back to bytetrack", bad)
        chosen = "bytetrack"

    try:
        if chosen == "sort":
            # Byt modulväg vid behov när CV-delen landar – här mockas i tester.
            mod = importlib.import_module("cv_engine.tracking.sort_impl")
            return getattr(mod, "SortTracker")
        else:
            mod = importlib.import_module("cv_engine.tracking.bytetrack_impl")
            return getattr(mod, "ByteTrackTracker")
    except Exception:
        # Fallback stubbar för testmiljö (saknar riktiga moduler)
        class _Sort:  # pragma: no cover (enkel stub)
            name = "SortTrackerStub"

        class _Byte:  # pragma: no cover
            name = "ByteTrackTrackerStub"

        return _Sort if chosen == "sort" else _Byte
