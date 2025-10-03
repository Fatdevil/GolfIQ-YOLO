from __future__ import annotations

# isort: skip_file
from time import perf_counter
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
from observability.otel import span
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
    tracker_name = tracker.__class__.__name__
    pose_adapter = PoseAdapter()
    pose_backend = pose_adapter.backend_name or "unknown"

    input_size = "unknown"
    if frames_list and frames_list[0].ndim >= 2:
        h, w = frames_list[0].shape[:2]
        input_size = f"{w}x{h}"

    timings: Dict[str, float] = {}
    boxes_per_frame: List[List[Box]] = []
    ball_track_px: List[Tuple[float, float]] = []
    club_track_px: List[Tuple[float, float]] = []
    events: List[int] = []
    confidence = 0.0
    metrics: Dict[str, Any]
    base_metrics: Any | None = None
    side_angle: float | None = None
    vert_launch: float | None = None
    carry_est: float | None = None

    span_attributes = {
        "cv.frames_total": len(frames_list),
        "cv.tracker": tracker_name,
        "cv.pose_backend": pose_backend,
        "cv.input_size": input_size,
    }

    with span("cv.pipeline.analyze", attributes=span_attributes) as pipeline_span:
        detection_total = 0
        detection_start = perf_counter()
        with span("cv.pipeline.detection") as detection_span:
            for fr in frames_list:
                boxes = det.run(fr)
                boxes_per_frame.append(list(boxes))
                detection_total += len(boxes)
        timings["detection_ms"] = (perf_counter() - detection_start) * 1000.0
        if detection_span is not None:
            detection_span.set_attribute("cv.detections_total", detection_total)

        tracking_start = perf_counter()
        active_ids: Dict[str, int] = {"ball": -1, "club": -1}
        with span("cv.pipeline.tracking", attributes={"cv.tracker": tracker_name}):
            for boxes in boxes_per_frame:
                tracked = tracker.update(boxes)

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
        timings["tracking_ms"] = (perf_counter() - tracking_start) * 1000.0

        pose_start = perf_counter()
        with span(
            "cv.pipeline.pose",
            attributes={
                "cv.pose_backend": pose_backend,
                "cv.pose.enabled": pose_adapter.is_enabled(),
            },
        ) as pose_span:
            if pose_span is not None:
                pose_span.set_attribute("cv.pose.frames", len(frames_list))
            if pose_adapter.is_enabled():
                for fr in frames_list:
                    pose_adapter.detect(fr)
        timings["pose_ms"] = (perf_counter() - pose_start) * 1000.0

        if smoothing_window > 1:
            ball_track_px = moving_average(ball_track_px, smoothing_window)
            club_track_px = moving_average(club_track_px, smoothing_window)

        kin_start = perf_counter()
        base_quality = {
            "fps": _quality_from_fps(calib.fps),
            "homography": "warn",
            "lighting": (
                _quality_from_lighting(frames_list[0]) if frames_list else "low"
            ),
        }

        if len(ball_track_px) < 2 or len(club_track_px) < 2:
            with span("cv.pipeline.kinematics"):
                pass
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
                "confidence": 0.0,
                "ballSpeedMps": 0.0,
                "clubSpeedMps": 0.0,
                "sideAngleDeg": None,
                "vertLaunchDeg": None,
                "carryEstM": 0.0,
                "quality": base_quality | {"homography": "low"},
            }
            timings["kinematics_ms"] = (perf_counter() - kin_start) * 1000.0
        else:
            with span("cv.pipeline.kinematics"):
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
            timings["kinematics_ms"] = (perf_counter() - kin_start) * 1000.0

        impact_start = perf_counter()
        with span("cv.pipeline.impact"):
            impact_events = ImpactDetector(detector=det).run_with_boxes(
                frames_list, boxes_per_frame
            )
        timings["impact_ms"] = (perf_counter() - impact_start) * 1000.0
        events = [e.frame_index for e in impact_events]
        confidence = max((e.confidence for e in impact_events), default=0.0)

        postproc_start = perf_counter()
        with span("cv.pipeline.postproc"):
            if len(ball_track_px) < 2 or len(club_track_px) < 2:
                metrics["confidence"] = confidence
            else:
                assert base_metrics is not None
                metrics.update(
                    {
                        "confidence": confidence,
                        "ballSpeedMps": round(base_metrics.ball_speed_mps, 3),
                        "clubSpeedMps": round(base_metrics.club_speed_mps, 3),
                        "sideAngleDeg": (
                            round(side_angle, 2) if side_angle is not None else None
                        ),
                        "vertLaunchDeg": (
                            round(vert_launch, 2) if vert_launch is not None else None
                        ),
                        "carryEstM": (
                            round(carry_est, 2) if carry_est is not None else 0.0
                        ),
                        "quality": base_quality,
                    }
                )
        timings["postproc_ms"] = (perf_counter() - postproc_start) * 1000.0

        if pipeline_span is not None:
            for key, value in timings.items():
                pipeline_span.set_attribute(f"cv.timings.{key}", round(value, 3))
            pipeline_span.set_attribute("cv.events.total", len(events))
            pipeline_span.set_attribute("cv.metrics.confidence", confidence)

    return {"events": events, "metrics": metrics}
