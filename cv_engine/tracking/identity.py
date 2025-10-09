from __future__ import annotations

import itertools
from typing import Dict, List, Sequence

from cv_engine.types import Box

from .base import TrackUpdate, TrackerBase


class IdentityTracker(TrackerBase):
    """Label-sticky tracker assigning deterministic ids per object type."""

    def __init__(self) -> None:
        self._label_ids: Dict[str, int] = {}
        self._next_id = itertools.count(1)

    def reset(self) -> None:
        self._label_ids.clear()
        self._next_id = itertools.count(1)

    def update(self, boxes: Sequence[Box]) -> List[TrackUpdate]:
        updates: List[TrackUpdate] = []
        for box in boxes:
            track_id = self._label_ids.get(box.label)
            if track_id is None:
                track_id = next(self._next_id)
                self._label_ids[box.label] = track_id
            updates.append((track_id, box))
        return updates
