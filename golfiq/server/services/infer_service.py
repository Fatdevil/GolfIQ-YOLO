import base64
import os
from typing import List, Optional, Tuple
from uuid import uuid4

import numpy as np

from ..schemas.infer_req_res import Box, InferRequest, InferResponse, Metrics
from .cv_engine_adapter import compute_metrics
from .quality_score import quality_score


def _frames_to_time(fps: float, t_opt: Optional[float], idx: int) -> float:
    return float(t_opt if t_opt is not None else (idx / fps))


def _traj_nn(frames: List[Tuple[float, List[Box]]], cls_name: str):
    traj = []
    last_cx, last_cy = None, None
    used = 0
    for t, dets in frames:
        cds = [
            (d, ((d.x1 + d.x2) / 2.0, (d.y1 + d.y2) / 2.0))
            for d in dets
            if d.cls == cls_name
        ]
        if not cds:
            continue
        if last_cx is None:
            d, (cx, cy) = max(cds, key=lambda x: x[0].conf)
        else:
            # nearest neighbor by center
            best = None
            bestd = 1e18
            cx = cy = 0.0
            for d, (cx_, cy_) in cds:
                d2 = (cx_ - last_cx) ** 2 + (cy_ - last_cy) ** 2
                if d2 < bestd:
                    bestd = d2
                    best = (cx_, cy_)
            cx, cy = best
        traj.append([t, cx, cy])
        last_cx, last_cy = cx, cy
        used += 1
    coverage = used / len(frames) if frames else 0.0
    return np.array(traj, dtype=float), coverage


def _traj_sortlite(
    frames: List[Tuple[float, List[Box]]], cls_name: str, iou_thr: float = 0.2
):
    from golfiq_cv.trackers.sortlite import track_single as sort_track

    # adapt Box to tracker expected structure via simple shim object
    class Shim:
        def __init__(self, b: Box):
            self.cls = b.cls
            self.conf = b.conf
            self.x1 = b.x1
            self.y1 = b.y1
            self.x2 = b.x2
            self.y2 = b.y2

    frames_shim = [(t, [Shim(b) for b in dets]) for t, dets in frames]
    traj, coverage = sort_track(frames_shim, cls_name=cls_name, iou_thr=iou_thr)
    import numpy as np

    return np.array(traj, dtype=float), coverage


def _build_trajs(
    frames: List[Tuple[float, List[Box]]], tracking_cfg
) -> tuple[np.ndarray, np.ndarray, float]:
    mode = tracking_cfg.mode if tracking_cfg else "nn"
    if mode == "sortlite":
        iou_thr = tracking_cfg.iou_thr if tracking_cfg else 0.2
        ball, cov_ball = _traj_sortlite(frames, "ball", iou_thr=iou_thr)
        club, cov_club = _traj_sortlite(frames, "club_head", iou_thr=iou_thr)
    else:
        ball, cov_ball = _traj_nn(frames, "ball")
        club, cov_club = _traj_nn(frames, "club_head")
    coverage = min(cov_ball, cov_club)
    return ball, club, coverage


def run_inference_from_detections(req: InferRequest) -> InferResponse:
    assert req.detections is not None
    frames = []
    for idx, f in enumerate(req.detections):
        t = _frames_to_time(req.meta.fps, f.t, idx)
        frames.append((t, f.dets))
    ball, club, coverage = _build_trajs(frames, req.tracking)
    metrics = compute_metrics(
        ball=ball, club=club, scale_m_per_px=req.meta.scale_m_per_px
    )
    q = quality_score(
        num_points=min(len(ball), len(club)),
        fps=req.meta.fps,
        calibrated=req.meta.calibrated,
        coverage=coverage,
    )
    return InferResponse(
        shot_id=str(uuid4()), metrics=Metrics(**metrics), quality=q, meta=req.meta
    )


def run_inference_from_frames_b64(req: InferRequest) -> InferResponse:
    if os.getenv("YOLO_INFERENCE", "false").lower() != "true":
        raise NotImplementedError(
            "YOLO inference disabled. Set YOLO_INFERENCE=true and provide YOLO model."
        )
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
        from golfiq_cv.detectors.yolov8 import YoloV8Detector  # type: ignore
    except Exception as e:
        raise NotImplementedError(
            "YOLO runtime deps missing (ultralytics, opencv). Install and retry."
        ) from e

    assert req.frames is not None and req.yolo is not None
    det = YoloV8Detector(
        req.yolo.model_path, class_map=req.yolo.class_map, conf=req.yolo.conf
    )

    frames = []
    for idx, f in enumerate(req.frames):
        t = _frames_to_time(req.meta.fps, f.t, idx)
        img_bytes = base64.b64decode(f.image_b64)
        buf = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        detections = det.predict(img)
        boxes = [
            Box(cls=d.cls, conf=d.conf, x1=d.x1, y1=d.y1, x2=d.x2, y2=d.y2)
            for d in detections
        ]
        frames.append((t, boxes))

    ball, club, coverage = _build_trajs(frames, req.tracking)
    metrics = compute_metrics(
        ball=ball, club=club, scale_m_per_px=req.meta.scale_m_per_px
    )
    q = quality_score(
        num_points=min(len(ball), len(club)),
        fps=req.meta.fps,
        calibrated=req.meta.calibrated,
        coverage=coverage,
    )
    return InferResponse(
        shot_id=str(uuid4()), metrics=Metrics(**metrics), quality=q, meta=req.meta
    )


def run_infer(req: InferRequest) -> InferResponse:
    """Dispatch inference based on request mode."""
    if req.mode == "detections":
        return run_inference_from_detections(req)
    elif req.mode == "frames_b64":
        return run_inference_from_frames_b64(req)
    else:
        raise ValueError(f"unsupported mode: {req.mode}")
