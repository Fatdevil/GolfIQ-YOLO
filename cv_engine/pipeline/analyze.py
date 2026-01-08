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
from cv_engine.inference.model_registry import get_detection_engine
from cv_engine.pose.adapter import PoseAdapter
from cv_engine.sequence import analyze_kinematic_sequence
from cv_engine.tracking.factory import get_ball_tracker, get_tracker
from cv_engine.telemetry import FlightRecorder, flight_recorder_settings
from observability.otel import span
from server.metrics.faceon import compute_faceon_metrics
from server.telemetry import record_pose_metrics, record_stage_latency
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
    model_variant: str | None = None,
    variant_source: str | None = None,
) -> Dict[str, Any]:
    """Analyze sequence of frames for ball/club metrics."""

    frames_list = list(frames)

    det = get_detection_engine(
        mock=(mock if mock is not None else False),
        motion=(motion if motion is not None else (2.0, -1.0, 1.5, 0.0)),
        variant=model_variant,
        variant_source=variant_source,
    )

    ball_tracker = get_ball_tracker()
    ball_tracker_name = ball_tracker.__class__.__name__
    club_tracker = get_tracker()
    club_tracker_name = club_tracker.__class__.__name__
    pose_adapter = PoseAdapter()
    pose_backend = pose_adapter.backend_name or "unknown"

    input_size = "unknown"
    if frames_list and frames_list[0].ndim >= 2:
        h, w = frames_list[0].shape[:2]
        input_size = f"{w}x{h}"

    recorder_enabled, frame_sample_rate = flight_recorder_settings()
    recorder_metadata = {
        "detector": det.__class__.__name__,
        "mock": det.mock,
        "tracker": club_tracker_name,
        "ballTracker": ball_tracker_name,
        "poseBackend": pose_backend,
        "inputSize": input_size,
        "fps": calib.fps,
        "smoothingWindow": smoothing_window,
        "modelVariant": getattr(det, "variant", "unknown"),
    }
    recorder = FlightRecorder(
        enabled=recorder_enabled,
        session_metadata=recorder_metadata,
        frame_sample_rate=frame_sample_rate,
    )
    if not pose_adapter.is_enabled():
        recorder.record_event("pose_disabled", {"backend": pose_backend})

    timings: Dict[str, float] = {}
    boxes_per_frame: List[List[Box]] = []
    detection_times: List[float] = []
    ball_track_px: List[Tuple[float, float]] = []
    club_track_px: List[Tuple[float, float]] = []
    events: List[int] = []
    confidence = 0.0
    metrics: Dict[str, Any]
    base_metrics: Any | None = None
    side_angle: float | None = None
    vert_launch: float | None = None
    carry_est: float | None = None
    faceon_metrics: Dict[str, Any] | None = None

    span_attributes = {
        "cv.frames_total": len(frames_list),
        "cv.tracker": club_tracker_name,
        "cv.ball_tracker": ball_tracker_name,
        "cv.pose_backend": pose_backend,
        "cv.input_size": input_size,
    }

    with span("cv.pipeline.analyze", attributes=span_attributes) as pipeline_span:
        detection_total = 0
        detection_start = perf_counter()
        with span("cv.stage.detect") as detection_span:
            for idx, fr in enumerate(frames_list):
                run_start = perf_counter()
                boxes = det.run(fr)
                detection_times.append((perf_counter() - run_start) * 1000.0)
                boxes_per_frame.append(list(boxes))
                detection_total += len(boxes)
        detection_ms = (perf_counter() - detection_start) * 1000.0
        detection_avg_ms = (
            float(sum(detection_times) / len(detection_times))
            if detection_times
            else None
        )
        timings["detect_ms"] = detection_ms
        if detection_avg_ms is not None:
            timings["detect_avg_ms"] = detection_avg_ms
        record_stage_latency("detect", detection_ms)
        if detection_span is not None:
            detection_span.set_attribute("cv.detections_total", detection_total)
            detection_span.set_attribute("cv.detections_frames", len(frames_list))
            detection_span.set_attribute("cv.detections_inference_ms", detection_ms)
            if detection_avg_ms is not None:
                detection_span.set_attribute(
                    "cv.detections_inference_avg_ms", detection_avg_ms
                )

        if frames_list and boxes_per_frame:
            try:
                frame_h, frame_w = frames_list[0].shape[:2]
                detections_payload = [
                    {
                        "bbox": [box.x1, box.y1, box.x2, box.y2],
                        "cls": box.label,
                        "score": box.score,
                    }
                    for box in boxes_per_frame[0]
                ]
                faceon_metrics = compute_faceon_metrics(
                    detections_payload,
                    frame_w=frame_w,
                    frame_h=frame_h,
                    mm_per_px=(calib.m_per_px * 1000.0 if calib.m_per_px else None),
                )
            except Exception:
                faceon_metrics = None

        tracking_start = perf_counter()
        active_club_id = -1
        active_ids: Dict[str, int] = {"ball": -1, "club": -1}
        with span(
            "cv.stage.track",
            attributes={
                "cv.tracker": club_tracker_name,
                "cv.ball_tracker": ball_tracker_name,
            },
        ) as track_span:
            for frame_index, boxes in enumerate(boxes_per_frame):
                if det.mock:
                    tracked = club_tracker.update(boxes)
                    per_label: Dict[str, List[Tuple[int, Box]]] = {
                        "ball": [],
                        "club": [],
                    }
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
                            chosen_id, chosen_box = max(
                                seq, key=lambda item: item[1].score
                            )
                        if chosen_box is None:
                            continue
                        active_ids[label] = chosen_id
                        if label == "ball":
                            ball_track_px.append(chosen_box.center())
                        elif label == "club":
                            club_track_px.append(chosen_box.center())

                    ball_tracker.update([box for box in boxes if box.label == "ball"])
                    ball_tracks = len(per_label["ball"])
                    club_tracks = len(per_label["club"])
                else:
                    ball_boxes = [box for box in boxes if box.label == "ball"]
                    club_boxes = [box for box in boxes if box.label == "club"]

                    ball_result = ball_tracker.update(ball_boxes)
                    if ball_result is not None:
                        ball_track_px.append(ball_result.center)

                    club_tracked = club_tracker.update(club_boxes)
                    if club_tracked:
                        chosen_id: int | None = None
                        chosen_box: Box | None = None
                        for tid, box in club_tracked:
                            if tid == active_club_id:
                                chosen_id = tid
                                chosen_box = box
                                break
                        if chosen_box is None:
                            chosen_id, chosen_box = max(
                                club_tracked, key=lambda item: item[1].score
                            )
                        if chosen_box is not None and chosen_id is not None:
                            active_club_id = chosen_id
                            club_track_px.append(chosen_box.center())
                    ball_tracks = len(ball_boxes)
                    club_tracks = len(club_boxes)

                detection_count = len(boxes)
                recorder.record_frame(
                    frame_index,
                    inference_ms=(
                        detection_times[frame_index]
                        if frame_index < len(detection_times)
                        else None
                    ),
                    detections=detection_count,
                    ball_tracks=ball_tracks,
                    club_tracks=club_tracks,
                    dropped=detection_count == 0,
                )
            if track_span is not None:
                track_span.set_attribute("cv.track.frames", len(boxes_per_frame))
                tracking_metrics = ball_tracker.metrics.as_dict()
                for metric_name, metric_value in tracking_metrics.items():
                    track_span.set_attribute(f"cv.track.{metric_name}", metric_value)
        tracking_ms = (perf_counter() - tracking_start) * 1000.0
        timings["track_ms"] = tracking_ms
        record_stage_latency("track", tracking_ms)
        recorder.record_tracking_metrics(ball_tracker.metrics.as_dict())

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
            with span("cv.stage.kinematics"):
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
            kin_ms = (perf_counter() - kin_start) * 1000.0
            timings["kinematics_ms"] = kin_ms
            record_stage_latency("kinematics", kin_ms)
        else:
            with span("cv.stage.kinematics"):
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
            kin_ms = (perf_counter() - kin_start) * 1000.0
            timings["kinematics_ms"] = kin_ms
            record_stage_latency("kinematics", kin_ms)

        impact_start = perf_counter()
        with span("cv.pipeline.impact"):
            impact_events = ImpactDetector(detector=det).run_with_boxes(
                frames_list, boxes_per_frame
            )
        timings["impact_ms"] = (perf_counter() - impact_start) * 1000.0
        events = [e.frame_index for e in impact_events]
        confidence = max((e.confidence for e in impact_events), default=0.0)
        for shot_index, impact_event in enumerate(impact_events):
            recorder.record_shot(
                shot_index,
                start_frame=impact_event.frame_index,
                end_frame=impact_event.frame_index,
                confidence=impact_event.confidence,
            )

        sequence_metrics = analyze_kinematic_sequence(
            pose_history=pose_adapter.get_history(),
            club_track=club_track_px,
            events=events,
        )

        postproc_start = perf_counter()
        with span("cv.stage.persist"):
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
            if sequence_metrics is not None:
                metrics["sequence"] = sequence_metrics
            if faceon_metrics is not None:
                metrics["faceon"] = faceon_metrics
        persist_ms = (perf_counter() - postproc_start) * 1000.0
        timings["persist_ms"] = persist_ms
        record_stage_latency("persist", persist_ms)

        internal_pose_metrics = pose_adapter.get_internal_metrics()
        record_pose_metrics(internal_pose_metrics)

        if pipeline_span is not None:
            for key, value in timings.items():
                pipeline_span.set_attribute(f"cv.timings.{key}", round(value, 3))
            pipeline_span.set_attribute("cv.events.total", len(events))
            pipeline_span.set_attribute("cv.metrics.confidence", confidence)
            for metric_name, metric_value in internal_pose_metrics.items():
                if metric_value is not None:
                    pipeline_span.set_attribute(
                        f"cv.pose.{metric_name}", float(metric_value)
                    )
    recorder.set_status("ok")
    flight_recorder = recorder.to_dict() if recorder_enabled else None

    detection_summary = {
        "modelVariant": getattr(det, "variant", "unknown"),
        "frames": len(frames_list),
        "totalInferenceMs": round(timings.get("detect_ms", 0.0), 3),
        "avgInferenceMs": (
            round(timings["detect_avg_ms"], 3) if "detect_avg_ms" in timings else None
        ),
    }
    metrics["inference"] = detection_summary

    return {
        "events": events,
        "metrics": metrics,
        "flight_recorder": flight_recorder,
    }
