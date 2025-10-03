from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Dict, List, Sequence, Tuple

import numpy as np

from cv_engine.types import Box

from .base import TrackerBase, TrackUpdate


@dataclass
class _TrackState:
    track_id: int
    label: str
    score: float
    center: Tuple[float, float]
    last_box: Box
    age: int = 0


class ByteTrackAdapter(TrackerBase):
    """Lightweight approximation of ByteTrack assignment using IoU cost."""

    def __init__(self, iou_threshold: float = 0.3):
        self.iou_threshold = iou_threshold
        self._tracks: Dict[int, _TrackState] = {}
        self._next_id = itertools.count(1)

    def reset(self) -> None:
        self._tracks.clear()
        self._next_id = itertools.count(1)

    def _bbox_array(self, box: Box) -> np.ndarray:
        return np.array([box.x1, box.y1, box.x2, box.y2], dtype=float)

    def _iou(self, a: Box, b: Box) -> float:
        ax1, ay1, ax2, ay2 = self._bbox_array(a)
        bx1, by1, bx2, by2 = self._bbox_array(b)
        inter_x1 = max(ax1, bx1)
        inter_y1 = max(ay1, by1)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)
        inter_w = max(0.0, inter_x2 - inter_x1)
        inter_h = max(0.0, inter_y2 - inter_y1)
        inter_area = inter_w * inter_h
        if inter_area == 0:
            return 0.0
        area_a = (ax2 - ax1) * (ay2 - ay1)
        area_b = (bx2 - bx1) * (by2 - by1)
        union = max(area_a + area_b - inter_area, 1e-6)
        return float(inter_area / union)

    def update(self, boxes: Sequence[Box]) -> List[TrackUpdate]:
        if not boxes:
            for state in self._tracks.values():
                state.age += 1
            return []

        updates: List[TrackUpdate] = []
        taken: set[int] = set()

        for box in boxes:
            best_track_id: int | None = None
            best_score = -1.0
            for track_id, state in self._tracks.items():
                if state.label != box.label or track_id in taken:
                    continue
                iou = self._iou(state.last_box, box)
                if iou >= self.iou_threshold and iou > best_score:
                    best_track_id = track_id
                    best_score = iou
            if best_track_id is None:
                best_track_id = next(self._next_id)
            taken.add(best_track_id)
            center = box.center()
            self._tracks[best_track_id] = _TrackState(
                track_id=best_track_id,
                label=box.label,
                score=box.score,
                center=center,
                last_box=box,
                age=0,
            )
            updates.append((best_track_id, box))

        # Age unmatched tracks (decay)
        for track_id, state in list(self._tracks.items()):
            if track_id not in taken:
                state.age += 1
                if state.age > 30:
                    self._tracks.pop(track_id, None)

        return updates
