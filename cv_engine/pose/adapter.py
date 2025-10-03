from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np

from .mediapipe_backend import MediaPipeBackend, MEDIAPIPE_JOINTS
from .movenet_backend import MoveNetBackend, MOVENET_JOINTS

PoseResult = Dict[str, tuple[float, float, float]]


@dataclass
class PoseAdapter:
    """Configurable pose adapter selecting backend from env."""

    backend_name: str | None = None

    def __post_init__(self) -> None:
        backend = (self.backend_name or os.getenv("POSE_BACKEND", "mediapipe")).lower()
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
        return self._backend.detect(frame)

    def is_enabled(self) -> bool:
        return self._backend is not None

    def info(self) -> Dict[str, Optional[str]]:
        return {"backend": self.backend_name}
