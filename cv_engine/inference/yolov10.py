from __future__ import annotations

from typing import List, Sequence, Tuple

import numpy as np

from cv_engine.types import Box

from .detection_engine import DetectionEngine
from .yolo8 import YoloV8Detector


class YoloV10Engine(DetectionEngine):
    """YOLOv10 adapter wrapping the existing YOLO loader."""

    variant = "yolov10"

    def __init__(
        self,
        weight_path: str | None = None,
        device: str = "cpu",
        *,
        mock: bool | None = None,
        motion: Tuple[float, float, float, float] | None = None,
    ):
        self._detector = YoloV8Detector(
            weight_path=weight_path,
            device=device,
            mock=mock,
            motion=motion,
        )

    @property
    def mock(self) -> bool:
        return bool(getattr(self._detector, "mock", False))

    def detect(self, image: "np.ndarray") -> Sequence[Box]:
        return list(self._detector.run(image))

    def run(self, image: "np.ndarray") -> List[Box]:
        return list(self.detect(image))
