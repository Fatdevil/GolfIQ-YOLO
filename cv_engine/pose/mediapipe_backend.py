from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

import numpy as np

PoseLandmarks = Tuple[float, float, float]


MEDIAPIPE_JOINTS = [
    "nose",
    "left_eye_inner",
    "left_eye",
    "left_eye_outer",
    "right_eye_inner",
    "right_eye",
    "right_eye_outer",
    "left_ear",
    "right_ear",
    "mouth_left",
    "mouth_right",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_pinky",
    "right_pinky",
    "left_index",
    "right_index",
    "left_thumb",
    "right_thumb",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
]


@dataclass
class MediaPipeBackend:
    """Lightweight placeholder backend returning coarse landmarks."""

    def detect(self, frame: np.ndarray) -> Dict[str, PoseLandmarks]:
        h, w = frame.shape[:2]
        cx, cy = w / 2.0, h / 2.0
        scale_x = w / 6.0 if w else 1.0
        scale_y = h / 6.0 if h else 1.0
        out: Dict[str, PoseLandmarks] = {}
        for idx, name in enumerate(MEDIAPIPE_JOINTS):
            dx = ((idx % 6) - 2.5) * 0.3 * scale_x
            dy = ((idx // 6) - 2.5) * 0.25 * scale_y
            out[name] = (cx + dx, cy + dy, 0.7)
        return out
