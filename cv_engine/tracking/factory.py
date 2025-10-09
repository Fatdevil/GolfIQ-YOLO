from __future__ import annotations

import os
from typing import Dict

from cv_engine.tracking.base import TrackerBase
from cv_engine.tracking.identity import IdentityTracker
from cv_engine.tracking.bytetrack import ByteTrackTracker
from cv_engine.tracking.norfair import NorfairTracker

_TRACKERS: Dict[str, type[TrackerBase]] = {
    "identity": IdentityTracker,
    "bytetrack": ByteTrackTracker,
    "norfair": NorfairTracker,
}


def get_tracker(name: str | None = None, **kwargs) -> TrackerBase:
    """Return tracker instance based on env or explicit name."""

    if name is None:
        name = os.getenv("GOLFIQ_TRACKER", "identity").strip().lower()
    tracker_cls = _TRACKERS.get(name)
    if tracker_cls is None:
        tracker_cls = _TRACKERS["identity"]
    return tracker_cls(**kwargs)
