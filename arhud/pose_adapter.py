from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class PoseFrame:
    position: tuple[float, float, float]
    rotation: tuple[float, float, float]
    tracking_quality: float
    timestamp: float


class PoseAdapter:
    def __init__(self) -> None:
        self._last_frame: Optional[PoseFrame] = None

    def ingest(self, position: tuple[float, float, float], rotation: tuple[float, float, float], tracking_quality: float, timestamp: float) -> PoseFrame:
        frame = PoseFrame(position=position, rotation=rotation, tracking_quality=tracking_quality, timestamp=timestamp)
        self._last_frame = frame
        return frame

    @property
    def last_frame(self) -> Optional[PoseFrame]:
        return self._last_frame