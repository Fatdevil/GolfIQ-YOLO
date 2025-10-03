from __future__ import annotations

import os
from typing import Dict

from cv_engine.tracking.base import IdentityTracker, TrackerBase
from cv_engine.tracking.bytetrack_adapter import ByteTrackAdapter
from cv_engine.tracking.norfair_adapter import NorfairAdapter

_TRACKERS: Dict[str, type[TrackerBase]] = {
    "identity": IdentityTracker,
    "bytetrack": ByteTrackAdapter,
    "norfair": NorfairAdapter,
}


def get_tracker(name: str | None = None, **kwargs) -> TrackerBase:
    """Return tracker instance based on env or explicit name."""

    if name is None:
        name = os.getenv("GOLFIQ_TRACKER", "bytetrack").strip().lower()
    tracker_cls = _TRACKERS.get(name)
    if tracker_cls is None:
        tracker_cls = _TRACKERS["bytetrack"]
    return tracker_cls(**kwargs)
