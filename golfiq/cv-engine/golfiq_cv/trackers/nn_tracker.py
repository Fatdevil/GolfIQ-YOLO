from typing import List, Tuple

from ..detectors.base import Detection


def _dist2(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def track_single_class(
    frames: List[List[Detection]], cls_name: str, max_jump_px: float = 100.0
) -> List[Tuple[int, float, float]]:
    """Very small nearest-neighbor tracker.
    Returns a trajectory list of (frame_idx, cx, cy) for the object class.
    If multiple detections of same class appear, it follows the nearest
    to the last center.
    """
    traj: List[Tuple[int, float, float]] = []
    last_center = None
    max_jump2 = max_jump_px * max_jump_px
    for i, dets in enumerate(frames):
        candidates = [(d, (d.cx, d.cy)) for d in dets if d.cls == cls_name]
        if not candidates:
            continue
        if last_center is None:
            # take the most confident
            d, center = max(candidates, key=lambda dc: dc[0].conf)
            traj.append((i, center[0], center[1]))
            last_center = center
            continue
        # pick nearest to last_center within threshold
        best = None
        bestd = float("inf")
        for d, c in candidates:
            d2 = _dist2(c, last_center)
            if d2 < bestd:
                bestd = d2
                best = (i, c[0], c[1])
        if best is not None and bestd <= max_jump2:
            traj.append(best)
            last_center = (best[1], best[2])
    return traj
