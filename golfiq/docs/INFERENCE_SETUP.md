# Inference Setup (v0.9)

## Paths
- `POST /infer` — två lägen:
  1) **detections**: skicka färdiga detektioner per frame (CI‑vänligt).
  2) **frames_b64**: skicka bildrutor som base64 (kräver YOLO vid runtime).

- `GET /calibrate?a4_width_px=NNN` — ger `scale_m_per_px` (A4 = 0.210 m).

## YOLO‑runtime (valfritt)
För att aktivera riktig YOLOv8‑inferenz:
```
pip install ultralytics pillow
export YOLO_INFERENCE=true
export YOLO_MODEL_PATH=/path/to/yolov8n.pt
```
Skicka sedan `frames_b64` (t.ex. JPEG‑dataURL).

## Detections‑läge (exempel)
```json
{
  "fps": 120,
  "scale_m_per_px": 0.002,
  "mode": "detections",
  "detections": [
    {"frame_idx":0,"detections":[{"cls":"club_head","conf":0.9,"x1":100,"y1":500,"x2":120,"y2":520},{"cls":"ball","conf":0.95,"x1":300,"y1":520,"x2":310,"y2":530}]}]
}
```
