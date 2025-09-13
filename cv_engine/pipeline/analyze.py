from __future__ import annotations
from typing import Iterable, Dict, Any, List, Tuple
import numpy as np
from ..inference.yolo8 import YoloV8Detector
from ..impact.detector import ImpactDetector
from ..metrics.kinematics import CalibrationParams
from ..calibration.simple import measure_from_tracks, as_dict


def _centers_by_label(boxes) -> Dict[str, List[Tuple[float, float]]]:
    out: Dict[str, List[Tuple[float, float]]] = {"ball": [], "club": []}
    for b in boxes:
        if b.label in out:
            out[b.label].append(b.center())
    return {k: ([v[0]] if v else []) for k, v in out.items()}


def analyze_frames(
    frames: Iterable["np.ndarray"], calib: CalibrationParams
) -> Dict[str, Any]:
    det = YoloV8Detector()
    ball_track: List[Tuple[float, float]] = []
    club_track: List[Tuple[float, float]] = []
    for fr in frames:
        centers = _centers_by_label(det.run(fr))
        if centers["ball"]:
            ball_track.append(centers["ball"][0])
        if centers["club"]:
            club_track.append(centers["club"][0])

    events = [e.frame_index for e in ImpactDetector().run(frames)]

    if len(ball_track) < 2 or len(club_track) < 2:
        metrics = {
            "ball_speed_mps": 0.0,
            "ball_speed_mph": 0.0,
            "club_speed_mps": 0.0,
            "launch_deg": 0.0,
            "carry_m": 0.0,
        }
    else:
        m = measure_from_tracks(ball_track, club_track, calib)
        metrics = as_dict(m)
    return {"events": events, "metrics": metrics}
