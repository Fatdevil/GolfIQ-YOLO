from __future__ import annotations

# isort: skip_file
import numpy as np
from typing import Any, Dict, Iterable, List, Tuple

from .types import Box
from .inference.yolo8 import YoloV8Detector
from .impact.detector import ImpactDetector
from .metrics.kinematics import CalibrationParams
from .calibration.simple import measure_from_tracks, as_dict
from .metrics.smoothing import moving_average


def _centers_by_label(boxes: List[Box]) -> Dict[str, List[Tuple[float, float]]]:
    out: Dict[str, List[Tuple[float, float]]] = {"ball": [], "club": []}
    for b in boxes:
        if b.label in out:
            out[b.label].append(b.center())
    # välj första per frame om flera
    return {k: ([v[0]] if v else []) for k, v in out.items()}


def analyze_frames(
    frames: Iterable["np.ndarray"],
    calib: CalibrationParams,
    *,
    # request-scoped mock controls (do NOT read env here)
    mock: bool | None = None,
    motion: Tuple[float, float, float, float] | None = None,
    smoothing_window: int = 1,
) -> Dict[str, Any]:
    """
    Single-pass: call detector.run() once per frame; reuse boxes for tracking and impact.
    Security branch: request-scoped mock/motion (no global env).
    """
    frames_list = list(frames)

    det = YoloV8Detector(
        mock=(mock if mock is not None else False),
        motion=(motion if motion is not None else (2.0, -1.0, 1.5, 0.0)),
    )

    boxes_per_frame: List[List[Box]] = []
    ball_track: List[Tuple[float, float]] = []
    club_track: List[Tuple[float, float]] = []

    for fr in frames_list:
        boxes = det.run(fr)
        boxes_per_frame.append(boxes)
        centers = _centers_by_label(boxes)
        if centers["ball"]:
            ball_track.append(centers["ball"][0])
        if centers["club"]:
            club_track.append(centers["club"][0])

    if smoothing_window > 1:
        ball_track = moving_average(ball_track, smoothing_window)
        club_track = moving_average(club_track, smoothing_window)

    # Reuse boxes for impact; do not call YOLO again
    impact_events = ImpactDetector(detector=det).run_with_boxes(
        frames_list, boxes_per_frame
    )
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
        return {"events": events, "metrics": metrics}

    m = measure_from_tracks(ball_track, club_track, calib)
    metrics = as_dict(m)
    metrics["confidence"] = confidence
    return {"events": events, "metrics": metrics}
