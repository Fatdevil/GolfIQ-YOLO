from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

import numpy as np

from .mediapipe_backend import MEDIAPIPE_JOINTS, MediaPipeBackend
from .movenet_backend import MOVENET_JOINTS, MoveNetBackend

PoseResult = Dict[str, tuple[float, float, float]]


@dataclass
class PoseAdapter:
    """Configurable pose adapter selecting backend from env with derived metrics."""

    backend_name: str | None = None
    _history: List[PoseResult] = field(default_factory=list, init=False, repr=False)
    _history_limit: int = 180

    def __post_init__(self) -> None:
        backend = (self.backend_name or os.getenv("POSE_BACKEND", "none")).lower()
        if backend == "movenet":
            self._backend = MoveNetBackend()
            self.joints = tuple(MOVENET_JOINTS)
        elif backend in {"none", "disabled", "off"}:
            self._backend = None
            self.joints = ()
        else:
            self._backend = MediaPipeBackend()
            self.joints = tuple(MEDIAPIPE_JOINTS)
        self.backend_name = backend

    def detect(self, frame: np.ndarray) -> PoseResult:
        if self._backend is None:
            return {}
        result = self._backend.detect(frame)
        self._history.append(result)
        if len(self._history) > self._history_limit:
            self._history = self._history[-self._history_limit :]
        return result

    def is_enabled(self) -> bool:
        return self._backend is not None

    def reset(self) -> None:
        self._history.clear()

    def info(self) -> Dict[str, Optional[str]]:
        return {"backend": self.backend_name}

    def derive_metrics(
        self, history: Sequence[PoseResult] | None = None
    ) -> Dict[str, Optional[float]]:
        records = list(history if history is not None else self._history)
        shoulder = self._tilt_from_history(records, "left_shoulder", "right_shoulder")
        hip = self._tilt_from_history(records, "left_hip", "right_hip")
        tempo = self._tempo_ratio(records)
        return {
            "shoulder_tilt_deg": shoulder,
            "hip_tilt_deg": hip,
            "tempo_ratio": tempo,
        }

    def get_internal_metrics(self) -> Dict[str, Optional[float]]:
        return self.derive_metrics()

    def _tilt_from_history(
        self, history: Sequence[PoseResult], left_key: str, right_key: str
    ) -> Optional[float]:
        for result in reversed(history):
            left = result.get(left_key)
            right = result.get(right_key)
            if left is None or right is None:
                continue
            return self._tilt_deg(left, right)
        return None

    def _tilt_deg(
        self, left: tuple[float, float, float], right: tuple[float, float, float]
    ) -> float:
        lx, ly, _ = left
        rx, ry, _ = right
        dx = rx - lx
        dy = ly - ry  # invert image axis: smaller y means higher point
        if dx == 0 and dy == 0:
            return 0.0
        angle = math.degrees(math.atan2(dy, dx))
        # Clamp to a readable posture range ([-90°, 90°]) to avoid flipping when
        # the points are reported in reverse order by the backend.
        if angle > 90.0:
            angle = 180.0 - angle
        elif angle < -90.0:
            angle = -180.0 - angle
        return float(angle)

    def _tempo_ratio(self, history: Sequence[PoseResult]) -> Optional[float]:
        if len(history) < 3:
            return None
        wrist_positions: List[tuple[int, float]] = []
        for idx, result in enumerate(history):
            wrist = result.get("right_wrist") or result.get("left_wrist")
            if wrist is None:
                continue
            _, y, _ = wrist
            wrist_positions.append((idx, y))
        if len(wrist_positions) < 3:
            return None
        # Lower y => higher hand in image coordinates.
        peak_idx, _ = min(wrist_positions, key=lambda item: item[1])
        backswing = peak_idx + 1
        downswing = len(history) - peak_idx - 1
        if downswing <= 0:
            return None
        return float(backswing / downswing)
