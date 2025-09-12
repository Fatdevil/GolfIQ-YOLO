from typing import Dict, List, Optional


def _xyxy(det: Dict):
    b = det.get("bbox") or det.get("xyxy")
    if not b or len(b) != 4:
        return None
    x1, y1, x2, y2 = map(float, b)
    if x2 < x1 or y2 < y1:
        return None
    return x1, y1, x2, y2


def _is_person(det: Dict):
    c = (det.get("cls") or det.get("class") or det.get("label") or "").lower()
    cid = det.get("cls_id") if isinstance(det.get("cls_id"), int) else None
    return c == "person" or cid == 0


def compute_faceon_metrics(
    detections: List[Dict],
    frame_w: int,
    frame_h: int,
    mm_per_px: Optional[float] = None,
) -> Dict:
    """Heuristic MVP for face-on metrics.

    - sway: distance from person center to frame center
    - shoulder_tilt/shaft_lean: placeholders until pose/club data available
    """
    person = None
    area_max = -1
    for d in detections or []:
        if not _is_person(d):
            continue
        box = _xyxy(d)
        if not box:
            continue
        x1, y1, x2, y2 = box
        a = (x2 - x1) * (y2 - y1)
        if a > area_max:
            area_max, person = a, box

    sway_px = 0.0
    if person:
        x1, y1, x2, y2 = person
        cx = (x1 + x2) / 2.0
        sway_px = float(cx - (frame_w / 2.0))

    sway_cm: Optional[float] = None
    if mm_per_px:
        sway_cm = abs(sway_px) * (mm_per_px / 10.0)

    return {
        "sway_px": sway_px,
        "sway_cm": None if sway_cm is None else float(sway_cm),
        "shoulder_tilt_deg": 0.0,
        "shaft_lean_deg": 0.0,
        "frame": {"w": int(frame_w), "h": int(frame_h)},
        "notes": None if person else "no-person-detected",
    }
