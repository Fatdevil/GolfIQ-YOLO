import argparse
import os

import numpy as np

from .impact.detector import ImpactDetector


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock-frames", type=int, default=5, help="antal dummy-frames")
    args = ap.parse_args()
    os.environ.setdefault("GOLFIQ_MOCK", "1")
    frames = [np.zeros((720, 1280, 3), dtype=np.uint8) for _ in range(args.mock_frames)]
    ev = ImpactDetector().run(frames)
    print({"events": [e.frame_index for e in ev]})


if __name__ == "__main__":
    main()
