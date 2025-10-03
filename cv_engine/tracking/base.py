from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable, List, Sequence, Tuple

from cv_engine.types import Box

TrackUpdate = Tuple[int, Box]


class TrackerBase(ABC):
    """Abstract tracker interface returning stable track ids per frame."""

    @abstractmethod
    def update(self, boxes: Sequence[Box]) -> List[TrackUpdate]:
        """Update tracker state with detections for current frame."""

    def reset(self) -> None:
        """Optional: clear all state."""
        # default implementation is stateless
        return None


class IdentityTracker(TrackerBase):
    """Deterministic tracker assigning ids sequentially per frame."""

    def update(self, boxes: Sequence[Box]) -> List[TrackUpdate]:
        return [(i + 1, box) for i, box in enumerate(boxes)]


class CompositeTracker(TrackerBase):
    """Utility tracker chaining multiple trackers (first write wins)."""

    def __init__(self, trackers: Iterable[TrackerBase]):
        self._trackers = list(trackers)

    def update(self, boxes: Sequence[Box]) -> List[TrackUpdate]:
        latest: List[TrackUpdate] = []
        for tracker in self._trackers:
            latest = tracker.update(boxes)
            boxes = [box for _, box in latest]
        return latest

    def reset(self) -> None:
        for tracker in self._trackers:
            tracker.reset()
