from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Dict, List, Sequence, Tuple

import numpy as np

from cv_engine.types import Box

from .base import TrackUpdate, TrackerBase


@dataclass
class _TrackState:
    track_id: int
    label: str
    center: Tuple[float, float]
    covariance: float
    last_box: Box
    age: int = 0


class NorfairTracker(TrackerBase):
    """Simplified Norfair-like tracker using distance based assignment."""

    def __init__(self, distance_threshold: float = 80.0):
        self.distance_threshold = distance_threshold
        self._tracks: Dict[int, _TrackState] = {}
        self._next_id = itertools.count(1)

    def reset(self) -> None:
        self._tracks.clear()
        self._next_id = itertools.count(1)

    def _distance(self, a: Tuple[float, float], b: Tuple[float, float]) -> float:
        return float(np.linalg.norm(np.array(a) - np.array(b)))

    def update(self, boxes: Sequence[Box]) -> List[TrackUpdate]:
        if not boxes:
            for track in self._tracks.values():
                track.age += 1
            return []

        updates: List[TrackUpdate] = []
        assigned: set[int] = set()

        for box in boxes:
            center = box.center()
            best_track: _TrackState | None = None
            best_dist = float("inf")
            for track in self._tracks.values():
                if track.label != box.label or track.track_id in assigned:
                    continue
                dist = self._distance(track.center, center)
                if dist < best_dist and dist <= self.distance_threshold:
                    best_dist = dist
                    best_track = track
            if best_track is None:
                track_id = next(self._next_id)
            else:
                track_id = best_track.track_id
            assigned.add(track_id)
            self._tracks[track_id] = _TrackState(
                track_id=track_id,
                label=box.label,
                center=center,
                covariance=min(
                    best_dist if best_track else self.distance_threshold,
                    self.distance_threshold,
                ),
                last_box=box,
                age=0,
            )
            updates.append((track_id, box))

        for track_id, track in list(self._tracks.items()):
            if track_id not in assigned:
                track.age += 1
                if track.age > 20:
                    self._tracks.pop(track_id, None)

        return updates
