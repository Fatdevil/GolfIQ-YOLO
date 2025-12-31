from typing import Iterable, List, Sequence

import numpy as np

from ..inference.detection_engine import DetectionEngine
from ..inference.model_registry import get_detection_engine
from ..tracking.factory import get_tracker
from ..types import Box, ImpactEvent


def _overlap(a: Box, b: Box) -> bool:
    return not (a.x2 < b.x1 or b.x2 < a.x1 or a.y2 < b.y1 or b.y2 < a.y1)


class ImpactDetector:
    """
    Enkel heuristik för mock-läge:
      - impact = första frame där ball- och club-boxar överlappar
    """

    def __init__(self, detector: DetectionEngine | None = None):
        self.detector = detector or get_detection_engine()
        self.tracker = get_tracker()

    def run_with_boxes(
        self,
        _frames: Iterable["np.ndarray"],
        boxes_per_frame: Sequence[Sequence[Box]],
    ) -> List[ImpactEvent]:
        for idx, boxes in enumerate(boxes_per_frame):
            balls = [b for b in boxes if b.label == "ball"]
            clubs = [b for b in boxes if b.label == "club"]
            if any(_overlap(b, c) for b in balls for c in clubs):
                return [ImpactEvent(frame_index=idx, confidence=0.9)]
        return []

    def run(self, frames: Iterable["np.ndarray"]) -> List[ImpactEvent]:
        frames_list = list(frames)
        boxes_per_frame = [self.detector.run(frame) for frame in frames_list]
        return self.run_with_boxes(frames_list, boxes_per_frame)
