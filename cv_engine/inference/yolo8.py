import os
from typing import List, Tuple

import numpy as np

from ..types import Box


class YoloV8Detector:
    """
    Minimalt interface:
      - mock-läge (GOLFIQ_MOCK=1) ger deterministiska boxar (ball + club)
      - real-läge försöker ladda Ultralytics YOLO men faller snällt tillbaka till mock
    """

    def __init__(
        self,
        weight_path: str | None = None,
        device: str = "cpu",
        *,
        mock: bool | None = None,
        motion: Tuple[float, float, float, float] | None = None,
    ):
        default_mock = os.getenv("GOLFIQ_MOCK", "0") == "1"
        self.mock = mock if mock is not None else default_mock
        self.model = None
        self.calls = 0
        default_motion = (
            float(os.getenv("GOLFIQ_MOTION_DX_BALL", "2.0")),
            float(os.getenv("GOLFIQ_MOTION_DY_BALL", "-1.0")),
            float(os.getenv("GOLFIQ_MOTION_DX_CLUB", "1.5")),
            float(os.getenv("GOLFIQ_MOTION_DY_CLUB", "0.0")),
        )
        motion_vals = motion if motion is not None else default_motion
        self.dx_ball, self.dy_ball, self.dx_club, self.dy_club = (
            float(motion_vals[0]),
            float(motion_vals[1]),
            float(motion_vals[2]),
            float(motion_vals[3]),
        )
        if not self.mock and weight_path:
            try:
                from ultralytics import YOLO  # type: ignore

                self.model = YOLO(weight_path)
            except Exception:
                self.mock = True

    def run(self, image: "np.ndarray") -> List[Box]:
        h, w = image.shape[:2]
        self.calls += 1
        k = self.calls - 1
        if self.mock or self.model is None:
            bx1, by1, bx2, by2 = (
                int(w * 0.45),
                int(h * 0.48),
                int(w * 0.52),
                int(h * 0.55),
            )
            cx1, cy1, cx2, cy2 = (
                int(w * 0.30),
                int(h * 0.60),
                int(w * 0.38),
                int(h * 0.80),
            )
            bx1 += int(self.dx_ball * k)
            bx2 += int(self.dx_ball * k)
            by1 += int(self.dy_ball * k)
            by2 += int(self.dy_ball * k)
            cx1 += int(self.dx_club * k)
            cx2 += int(self.dx_club * k)
            cy1 += int(self.dy_club * k)
            cy2 += int(self.dy_club * k)
            bx1 = max(0, min(bx1, w - 1))
            bx2 = max(0, min(bx2, w - 1))
            by1 = max(0, min(by1, h - 1))
            by2 = max(0, min(by2, h - 1))
            cx1 = max(0, min(cx1, w - 1))
            cx2 = max(0, min(cx2, w - 1))
            cy1 = max(0, min(cy1, h - 1))
            cy2 = max(0, min(cy2, h - 1))
            return [
                Box(bx1, by1, bx2, by2, "ball", 0.95),
                Box(cx1, cy1, cx2, cy2, "club", 0.92),
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
