from __future__ import annotations

import os
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np

from ..calibration.simple import as_dict, measure_from_tracks
from ..impact.detector import ImpactDetector
from ..inference.yolo8 import YoloV8Detector
from ..metrics.kinematics import CalibrationParams


def _centers_by_label(boxes) -> Dict[str, List[Tuple[float, float]]]:
    out: Dict[str, List[Tuple[float, float]]] = {"ball": [], "club": []}
    for b in boxes:
        if b.label in out:
            out[b.label].append(b.center())
    return {k: ([v[0]] if v else []) for k, v in out.items()}


def analyze_frames(
    frames: Iterable["np.ndarray"],
    calib: CalibrationParams,
    mock: bool | None = None,
    motion: Tuple[float, float, float, float] | None = None,
) -> Dict[str, Any]:
    mock_mode = mock if mock is not None else os.getenv("GOLFIQ_MOCK", "0") == "1"
    motion_params = motion if motion is not None else (2.0, -1.0, 1.5, 0.0)
    det = YoloV8Detector(mock=mock_mode, motion=motion_params)
    ball_track: List[Tuple[float, float]] = []
    club_track: List[Tuple[float, float]] = []
    for fr in frames:
        centers = _centers_by_label(det.run(fr))
        if centers["ball"]:
            ball_track.append(centers["ball"][0])
        if centers["club"]:
            club_track.append(centers["club"][0])

    impact_detector = ImpactDetector(
        YoloV8Detector(mock=mock_mode, motion=motion_params)
    )
    impact_events = impact_detector.run(frames)
    events = [e.frame_index for e in impact_events]
    confidence = max((e.confidence for e in impact_events), default=0.0)

    if len(ball_track) < 2 or len(club_track) < 2:
        metrics = {
            "ball_speed_mps": 0.0,
            "ball_speed_mph": 0.0,
            "club_speed_mps": 0.0,
            "launch_deg": 0.0,
            "carry_m": 0.0,
            "confidence": confidence,
        }
    else:
        m = measure_from_tracks(ball_track, club_track, calib)
        metrics = as_dict(m)
        metrics["confidence"] = confidence
    return {"events": events, "metrics": metrics}
