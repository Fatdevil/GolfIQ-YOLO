from __future__ import annotations

# isort: skip_file
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np

from cv_engine.calibration.homography import (
    ground_homography_from_scale,
    to_ground_plane,
)
from cv_engine.metrics.angle import compute_side_angle
from cv_engine.metrics.carry_v1 import estimate_carry
from cv_engine.metrics.launch_mono import estimate_vertical_launch
from cv_engine.pose.adapter import PoseAdapter
from cv_engine.tracking.factory import get_tracker
from .inference.yolo8 import YoloV8Detector
from .impact.detector import ImpactDetector
from .metrics.kinematics import CalibrationParams
from .calibration.simple import measure_from_tracks, as_dict
from .metrics.smoothing import moving_average
from .types import Box


def _quality_from_fps(fps: float) -> str:
    if fps >= 100:
        return "good"
    if fps >= 60:
        return "warn"
    return "low"


def _quality_from_lighting(frame: np.ndarray) -> str:
    if frame.size == 0:
        return "low"
    brightness = float(frame.mean())
    if brightness >= 120:
        return "good"
    if brightness >= 60:
        return "warn"
    return "low"


def analyze_frames(
    frames: Iterable[np.ndarray],
    calib: CalibrationParams,
    *,
    mock: bool | None = None,
    motion: Tuple[float, float, float, float] | None = None,
    smoothing_window: int = 1,
) -> Dict[str, Any]:
    """Analyze sequence of frames for ball/club metrics."""

    frames_list = list(frames)

    det = YoloV8Detector(
        mock=(mock if mock is not None else False),
        motion=(motion if motion is not None else (2.0, -1.0, 1.5, 0.0)),
    )

    tracker = get_tracker()
    pose_adapter = PoseAdapter()

    boxes_per_frame: List[List[Box]] = []
    ball_track_px: List[Tuple[float, float]] = []
    club_track_px: List[Tuple[float, float]] = []
    active_ids: Dict[str, int] = {"ball": -1, "club": -1}

    for fr in frames_list:
        boxes = det.run(fr)
        tracked = tracker.update(boxes)
        boxes_per_frame.append([box for _, box in tracked])

        per_label: Dict[str, List[Tuple[int, Box]]] = {"ball": [], "club": []}
        for track_id, box in tracked:
            if box.label in per_label:
                per_label[box.label].append((track_id, box))

        for label, seq in per_label.items():
            if not seq:
                continue
            preferred = active_ids.get(label, -1)
            chosen_id: int | None = None
            chosen_box: Box | None = None
            for tid, box in seq:
                if tid == preferred:
                    chosen_id = tid
                    chosen_box = box
                    break
            if chosen_box is None:
                chosen_id, chosen_box = max(seq, key=lambda item: item[1].score)
            if chosen_box is None:
                continue
            active_ids[label] = chosen_id
            if label == "ball":
                ball_track_px.append(chosen_box.center())
            elif label == "club":
                club_track_px.append(chosen_box.center())

        if pose_adapter.is_enabled():
            pose_adapter.detect(fr)

    if smoothing_window > 1:
        ball_track_px = moving_average(ball_track_px, smoothing_window)
        club_track_px = moving_average(club_track_px, smoothing_window)

    impact_events = ImpactDetector(detector=det).run_with_boxes(
        frames_list, boxes_per_frame
    )
    events = [e.frame_index for e in impact_events]
    confidence = max((e.confidence for e in impact_events), default=0.0)

    base_quality = {
        "fps": _quality_from_fps(calib.fps),
        "homography": "warn",
        "lighting": _quality_from_lighting(frames_list[0]) if frames_list else "low",
    }

    if len(ball_track_px) < 2 or len(club_track_px) < 2:
        metrics = {
            "ball_speed_mps": 0.0,
            "ball_speed_mph": 0.0,
            "club_speed_mps": 0.0,
            "club_speed_mph": 0.0,
            "launch_deg": 0.0,
            "carry_m": 0.0,
            "metrics_version": 1,
            "spin_rpm": None,
            "spin_axis_deg": None,
            "club_path_deg": None,
            "confidence": confidence,
            "ballSpeedMps": 0.0,
            "clubSpeedMps": 0.0,
            "sideAngleDeg": None,
            "vertLaunchDeg": None,
            "carryEstM": 0.0,
            "quality": base_quality | {"homography": "low"},
        }
        return {"events": events, "metrics": metrics}

    base_metrics = measure_from_tracks(ball_track_px, club_track_px, calib)
    metrics = as_dict(base_metrics, include_spin_placeholders=True)

    H = ground_homography_from_scale(calib.m_per_px)
    ground_ball_track = to_ground_plane(ball_track_px, H)
    side_angle = compute_side_angle(ground_ball_track)

    vert_launch = estimate_vertical_launch(
        ball_track_px,
        ball_diameter_px=8.0,
        fps=calib.fps,
        m_per_px=calib.m_per_px,
    )

    carry_est = estimate_carry(
        base_metrics.ball_speed_mps,
        base_metrics.launch_deg,
    )

    metrics.update(
        {
            "confidence": confidence,
            "ballSpeedMps": round(base_metrics.ball_speed_mps, 3),
            "clubSpeedMps": round(base_metrics.club_speed_mps, 3),
            "sideAngleDeg": round(side_angle, 2) if side_angle is not None else None,
            "vertLaunchDeg": round(vert_launch, 2) if vert_launch is not None else None,
            "carryEstM": round(carry_est, 2),
            "quality": base_quality,
        }
    )
    return {"events": events, "metrics": metrics}
