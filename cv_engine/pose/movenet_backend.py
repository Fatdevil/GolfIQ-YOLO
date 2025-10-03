from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

import numpy as np

PoseLandmarks = Tuple[float, float, float]

MOVENET_JOINTS = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]


@dataclass
class MoveNetBackend:
    """Placeholder MoveNet backend with coarse skeleton."""

    def detect(self, frame: np.ndarray) -> Dict[str, PoseLandmarks]:
        h, w = frame.shape[:2]
        cx, cy = w / 2.0, h / 2.0
        out: Dict[str, PoseLandmarks] = {}
        for idx, name in enumerate(MOVENET_JOINTS):
            angle = (idx / max(len(MOVENET_JOINTS) - 1, 1)) * np.pi
            radius_x = w / 5.0
            radius_y = h / 5.0
            out[name] = (
                cx + radius_x * np.cos(angle),
                cy + radius_y * np.sin(angle),
                0.6,
            )
        return out
