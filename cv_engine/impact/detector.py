import os
from typing import Iterable, List

import numpy as np

from ..inference.yolo8 import YoloV8Detector
from ..tracking.factory import get_tracker
from ..types import Box, ImpactEvent


def _overlap(a: Box, b: Box) -> bool:
    return not (a.x2 < b.x1 or b.x2 < a.x1 or a.y2 < b.y1 or b.y2 < a.y1)


class ImpactDetector:
    """
    Enkel heuristik för mock-läge:
      - impact = första frame där ball- och club-boxar överlappar
    """

    def __init__(self, detector: YoloV8Detector | None = None):
        self.detector = detector or YoloV8Detector()
        self.tracker = get_tracker()
        self.mock = os.getenv("GOLFIQ_MOCK", "0") == "1"

    def run(self, frames: Iterable["np.ndarray"]) -> List[ImpactEvent]:
        for idx, frame in enumerate(frames):
            boxes = self.detector.run(frame)
            balls = [b for b in boxes if b.label == "ball"]
            clubs = [b for b in boxes if b.label == "club"]
            if any(_overlap(b, c) for b in balls for c in clubs):
                return [ImpactEvent(frame_index=idx, confidence=0.9)]
        return []
