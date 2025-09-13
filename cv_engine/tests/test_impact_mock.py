import os

import numpy as np

from cv_engine.impact.detector import ImpactDetector
from cv_engine.types import Box


class _FakeDet:
    def __init__(self):
        self.calls = 0

    def run(self, _img):
        self.calls += 1
        if self.calls < 2:  # ingen overlap i frame 0
            return [Box(0, 0, 10, 10, "ball", 1.0), Box(20, 20, 30, 30, "club", 1.0)]
        return [
            Box(0, 0, 20, 20, "ball", 1.0),
            Box(10, 10, 30, 30, "club", 1.0),
        ]  # overlap i frame 1


def test_impact_emits_event_on_overlap():
    os.environ["GOLFIQ_MOCK"] = "1"
    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(3)]
    ev = ImpactDetector(detector=_FakeDet()).run(frames)
    assert len(ev) == 1 and ev[0].frame_index == 1
