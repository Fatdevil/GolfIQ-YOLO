# DRX: Infer Upload (frames_b64 vs detections)

**Two modes in `/infer`:**
- `detections`: client sends detections per frame → CI-friendly, no YOLO deps.
- `frames_b64`: client sends base64 frames → server runs YOLO (production path).

**Why this split?** CI remains lightweight, while production keeps model control and GPU accel on server.

**Contract highlights:**
- `meta`: {fps, scale_m_per_px, calibrated, view}
- `yolo` (only for frames_b64): model_path and optional `class_map` (e.g., {0:"ball",1:"club_head"})
