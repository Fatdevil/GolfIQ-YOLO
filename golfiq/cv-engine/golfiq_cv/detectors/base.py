from dataclasses import dataclass
from typing import List


@dataclass
class Detection:
    cls: str
    conf: float
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2.0

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2.0


class DetectorBase:
    def predict(self, image) -> List[Detection]:
        """Return a list of detections for a single frame.
        'image' can be a numpy array (H,W,3) uint8. Coordinates in pixels.
        Implementations should not assume any particular backend.
        """
        raise NotImplementedError
