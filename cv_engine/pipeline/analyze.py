from __future__ import annotations

# isort: skip_file
import os
from time import perf_counter
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np

from observability.otel import span

from .calibration.simple import as_dict, measure_from_tracks
from .impact.detector import ImpactDetector
from .inference.yolo8 import YoloV8Detector
from .metrics.kinematics import CalibrationParams
from .metrics.smoothing import moving_average
from .types import Box


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
    metrics: Dict[str, Any]
    events: List[int] = []
    confidence = 0.0

    tracker_name = "centroid"
    pose_backend = os.getenv("GOLFIQ_POSE_BACKEND", "none") or "none"
    input_size = "0x0"
    if frames_list:
        h, w = frames_list[0].shape[:2]
        input_size = f"{w}x{h}"

    timings: Dict[str, float] = {}

    with span(
        "cv.pipeline.analyze",
        attributes={
            "cv.frames_total": len(frames_list),
            "cv.tracker": tracker_name,
            "cv.pose_backend": pose_backend,
            "cv.input_size": input_size,
        },
    ) as pipeline_span:
        detection_start = perf_counter()
        with span(
            "cv.pipeline.detection",
            attributes={
                "cv.frames_total": len(frames_list),
                "cv.detector.mock": bool(det.mock),
            },
        ) as detection_span:
            for fr in frames_list:
                boxes = det.run(fr)
                boxes_per_frame.append(boxes)
            if detection_span is not None and frames_list:
                detection_span.set_attribute(
                    "cv.detections.total",
                    sum(len(b) for b in boxes_per_frame),
                )
        timings["detection_ms"] = (perf_counter() - detection_start) * 1000.0

        tracking_start = perf_counter()
        with span(
            "cv.pipeline.tracking",
            attributes={"cv.tracker": tracker_name},
        ) as tracking_span:
            for boxes in boxes_per_frame:
                centers = _centers_by_label(boxes)
                if centers["ball"]:
                    ball_track.append(centers["ball"][0])
                if centers["club"]:
                    club_track.append(centers["club"][0])

            if smoothing_window > 1:
                ball_track = moving_average(ball_track, smoothing_window)
                club_track = moving_average(club_track, smoothing_window)

            if tracking_span is not None:
                tracking_span.set_attribute("cv.track.ball.len", len(ball_track))
                tracking_span.set_attribute("cv.track.club.len", len(club_track))
        timings["tracking_ms"] = (perf_counter() - tracking_start) * 1000.0

        pose_start = perf_counter()
        with span(
            "cv.pipeline.pose",
            attributes={"cv.pose.backend": pose_backend},
        ) as pose_span:
            if pose_span is not None:
                pose_span.set_attribute("cv.pose.enabled", pose_backend != "none")
        timings["pose_ms"] = (perf_counter() - pose_start) * 1000.0

        kinematics_start = perf_counter()
        with span("cv.pipeline.kinematics") as kinematics_span:
            if len(ball_track) < 2 or len(club_track) < 2:
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
                }
                has_tracks = False
            else:
                m = measure_from_tracks(ball_track, club_track, calib)
                metrics = as_dict(m, include_spin_placeholders=True)
                has_tracks = True
            if kinematics_span is not None:
                kinematics_span.set_attribute("cv.kinematics.has_tracks", has_tracks)
        timings["kinematics_ms"] = (perf_counter() - kinematics_start) * 1000.0

        impact_start = perf_counter()
        with span("cv.pipeline.impact") as impact_span:
            impact_events = ImpactDetector(detector=det).run_with_boxes(
                frames_list, boxes_per_frame
            )
            events = [e.frame_index for e in impact_events]
            confidence = max((e.confidence for e in impact_events), default=0.0)
            if impact_span is not None:
                impact_span.set_attribute("cv.impact.events", len(events))
                impact_span.set_attribute("cv.impact.confidence", confidence)
        timings["impact_ms"] = (perf_counter() - impact_start) * 1000.0

        postproc_start = perf_counter()
        with span("cv.pipeline.postproc") as postproc_span:
            metrics["confidence"] = confidence
            if postproc_span is not None:
                postproc_span.set_attribute("cv.metrics.confidence", confidence)
        timings["postproc_ms"] = (perf_counter() - postproc_start) * 1000.0

        if pipeline_span is not None:
            for key, value in timings.items():
                pipeline_span.set_attribute(f"cv.timings.{key}", round(value, 3))
            pipeline_span.set_attribute("cv.events.total", len(events))
            pipeline_span.set_attribute("cv.impact.confidence", confidence)

    return {"events": events, "metrics": metrics}
