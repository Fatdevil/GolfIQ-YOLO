from __future__ import annotations

from typing import List, Sequence, Tuple

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
        self.mock = mock if mock is not None else False
        self.motion = motion
        self._model = None

        try:
            from ultralytics import YOLO  # type: ignore

            if self.weight_path:
                self._model = YOLO(self.weight_path)
        except Exception:  # pragma: no cover - import guard
            pass

    def detect(self, image: "np.ndarray") -> Sequence[Box]:
        if self._model is None:
            raise RuntimeError("YOLOv11 not wired; use yolov10")

        results = self._model.predict(
            image, device=self.device, verbose=False
        )  # type: ignore[attr-defined]
        boxes: List[Box] = []
        for r in results:
            # Heuristic: pick top-2 boxes by confidence to mimic v10 mock outputs
            sorted_boxes = sorted(
                getattr(r, "boxes", []), key=lambda b: float(b.conf[0]), reverse=True
            )
            for b in sorted_boxes[:2]:
                x1, y1, x2, y2 = map(int, b.xyxy[0].tolist())
                cls = int(b.cls[0]) if hasattr(b, "cls") else 0
                score = float(b.conf[0]) if hasattr(b, "conf") else 0.0
                label = "ball" if cls == 0 else "object"
                boxes.append(Box(x1, y1, x2, y2, label, score))
        return boxes

    def run(self, image: "np.ndarray") -> Sequence[Box]:
        return self.detect(image)
