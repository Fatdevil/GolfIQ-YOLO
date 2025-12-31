from __future__ import annotations

from typing import Sequence, Tuple

import numpy as np

from cv_engine.types import Box

from .detection_engine import DetectionEngine


class YoloV11Engine(DetectionEngine):
    """Stub for YOLOv11 – only active when explicitly selected."""

    variant = "yolov11"

    def __init__(
        self,
        weight_path: str | None = None,
        device: str = "cpu",
        *,
        mock: bool | None = None,
        motion: Tuple[float, float, float, float] | None = None,
    ):
        self.weight_path = weight_path
        self.device = device
        self.mock = mock
        self.motion = motion

    def detect(self, image: "np.ndarray") -> Sequence[Box]:
        raise NotImplementedError(
            "MODEL_VARIANT=yolov11 was selected, but the YOLOv11 engine is not wired up yet."
        )

    def run(self, image: "np.ndarray") -> Sequence[Box]:
        return self.detect(image)
