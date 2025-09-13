from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class Box:
    x1: int
    y1: int
    x2: int
    y2: int
    label: str = "object"
    score: float = 1.0

    def center(self) -> Tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)


@dataclass(frozen=True)
class ImpactEvent:
    frame_index: int
    confidence: float = 0.9
