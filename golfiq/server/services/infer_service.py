from uuid import uuid4
import os, base64, io
import numpy as np
from typing import List
from ..schemas.infer_req import InferRequest
from ..schemas.analyze_req_res import AnalyzeResponse, AnalyzeMeta, Metrics
from ..services.quality_score import quality_score
from .cv_engine_adapter import compute_metrics
from golfiq_cv.detectors.base import Detection
from golfiq_cv.trackers.nn_tracker import track_single_class

def _detections_to_frames(req: InferRequest) -> List[List[Detection]]:
    frames: List[List[Detection]] = []
    assert req.detections is not None
    for fr in sorted(req.detections, key=lambda f: f.frame_idx):
        dets = []
        for d in fr.detections:
            dets.append(Detection(cls=d.cls, conf=d.conf, x1=d.x1, y1=d.y1, x2=d.x2, y2=d.y2))
        frames.append(dets)
    return frames

def _frames_to_trajs(frames: List[List[Detection]], fps: float):
    # Track 'ball' and 'club_head' using the lightweight NN tracker
    tb = track_single_class(frames, "ball")
    tc = track_single_class(frames, "club_head")
    ball = np.array([[i/fps, x, y] for (i,x,y) in tb], dtype=float)
    club = np.array([[i/fps, x, y] for (i,x,y) in tc], dtype=float)
    return ball, club

def _decode_images_b64(b64_list: list):
    images = []
    for b in b64_list:
        if "," in b:  # strip data URL prefix
            b = b.split(",", 1)[1]
        raw = base64.b64decode(b)
        try:
            from PIL import Image  # optional dependency
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            images.append(np.array(img))
        except Exception:
            # If PIL not available or image corrupted, skip
            continue
    return images

def run_infer(req: InferRequest) -> AnalyzeResponse:
    # Path 1: Detections (CI-friendly; preferred for tests)
    if (req.mode == "detections") or (req.detections is not None and req.mode is None):
        frames = _detections_to_frames(req)
        ball, club = _frames_to_trajs(frames, req.fps)
    # Path 2: Frames -> YOLO (requires env flag and ultralytics at runtime)
    elif (req.mode == "frames_b64") or (req.frames_b64 is not None):
        if os.getenv("YOLO_INFERENCE","false").lower() != "true":
            # To keep API simple in MVP we raise an exception here
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="YOLO inference disabled. Set YOLO_INFERENCE=true and provide YOLO_MODEL_PATH.")
        from golfiq_cv.detectors.yolov8 import YoloV8Detector  # lazy import ultralytics in implementation
        model_path = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
        det = YoloV8Detector(model_path, class_map={0:"ball",1:"club_head"})
        images = _decode_images_b64(req.frames_b64 or [])
        frames = [det.predict(img) for img in images]
        ball, club = _frames_to_trajs(frames, req.fps)
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Provide 'detections' or 'frames_b64'.")

    # Compute metrics
    metrics = compute_metrics(ball, club, req.scale_m_per_px)
    quality = quality_score(num_points=int(min(len(ball), len(club))), fps=req.fps, calibrated=req.calibrated)
    meta = AnalyzeMeta(fps=req.fps, scale_m_per_px=req.scale_m_per_px, calibrated=req.calibrated, view=req.view)

    return AnalyzeResponse(shot_id=str(uuid4()), metrics=Metrics(**metrics), quality=quality, meta=meta)
