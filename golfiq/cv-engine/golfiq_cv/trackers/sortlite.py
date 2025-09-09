from typing import List, Tuple
from dataclasses import dataclass

@dataclass
class BBox:
    x1: float; y1: float; x2: float; y2: float; conf: float

def _iou(a: BBox, b: BBox) -> float:
    ix1 = max(a.x1, b.x1); iy1 = max(a.y1, b.y1)
    ix2 = min(a.x2, b.x2); iy2 = min(a.y2, b.y2)
    iw = max(0.0, ix2 - ix1); ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    aw = max(0.0, a.x2 - a.x1); ah = max(0.0, a.y2 - a.y1)
    bw = max(0.0, b.x2 - b.x1); bh = max(0.0, b.y2 - b.y1)
    union = aw*ah + bw*bh - inter
    if union <= 0:
        return 0.0
    return inter / union

def track_single(frames: List[Tuple[float, list]], cls_name: str, iou_thr: float = 0.2):
    """Return a trajectory [ [t, cx, cy], ... ] and coverage ratio.
    frames: list of (t, boxes) where box has attributes (cls, conf, x1,y1,x2,y2)
    """
    traj = []
    prev_box = None
    total = len(frames); used = 0
    for t, boxes in frames:
        # collect class boxes
        candidates = [BBox(b.x1, b.y1, b.x2, b.y2, b.conf) for b in boxes if getattr(b, 'cls', None) == cls_name]
        if not candidates:
            continue
        chosen = None
        if prev_box is None:
            # pick highest conf
            chosen = max(candidates, key=lambda b: b.conf)
        else:
            # pick by best IoU, fallback to highest conf if IoU below threshold
            best = max(candidates, key=lambda b: _iou(prev_box, b))
            if _iou(prev_box, best) < iou_thr:
                best = max(candidates, key=lambda b: b.conf)
            chosen = best
        cx = (chosen.x1 + chosen.x2) / 2.0
        cy = (chosen.y1 + chosen.y2) / 2.0
        traj.append([t, cx, cy])
        prev_box = chosen
        used += 1
    coverage = used / total if total > 0 else 0.0
    return traj, coverage
