import os
from typing import List

import numpy as np

from ..types import Box


class YoloV8Detector:
    """
    Minimalt interface:
      - mock-läge (GOLFIQ_MOCK=1) ger deterministiska boxar (ball + club)
      - real-läge försöker ladda Ultralytics YOLO men faller snällt tillbaka till mock
    """

    def __init__(self, weight_path: str | None = None, device: str = "cpu"):
        self.mock = os.getenv("GOLFIQ_MOCK", "0") == "1"
        self.model = None
        if not self.mock and weight_path:
            try:
                from ultralytics import YOLO  # type: ignore

                self.model = YOLO(weight_path)
            except Exception:
                self.mock = True

    def run(self, image: "np.ndarray") -> List[Box]:
        h, w = image.shape[:2]
        if self.mock or self.model is None:
            # deterministiska boxar: en boll och en klubba
            return [
                Box(
                    int(w * 0.45),
                    int(h * 0.48),
                    int(w * 0.52),
                    int(h * 0.55),
                    "ball",
                    0.95,
                ),
                Box(
                    int(w * 0.30),
                    int(h * 0.60),
                    int(w * 0.38),
                    int(h * 0.80),
                    "club",
                    0.92,
                ),
            ]
        # (real-läge – håll lätt och utan tunga beroenden i tests)
        results = self.model.predict(image, device="cpu", verbose=False)  # type: ignore
        boxes: List[Box] = []
        for r in results:
            for b in r.boxes:
                x1, y1, x2, y2 = map(int, b.xyxy[0].tolist())
                cls = int(b.cls[0])
                score = float(b.conf[0])
                label = "ball" if cls == 0 else "object"
                boxes.append(Box(x1, y1, x2, y2, label, score))
        return boxes
