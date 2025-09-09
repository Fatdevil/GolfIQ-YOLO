# Runtime Setup (YOLOv8 on server)

To enable `/infer` in **frames_b64** mode:

1. Create and activate a virtualenv (recommended).
2. Install base deps:
   ```bash
   pip install -e cv-engine
   pip install -r server/requirements.txt
   ```
3. Install **YOLO runtime** deps:
   ```bash
   pip install -r server/requirements-optional.txt
   ```
4. Set environment and start server:
   ```bash
   export YOLO_INFERENCE=true
   export YOLO_MODEL_PATH=/absolute/path/to/yolov8n.pt
   uvicorn server.api.main:app --reload --port 8000
   ```

Now the server can accept `POST /infer` with `{ "mode":"frames_b64", "frames":[...], "yolo": {"model_path": "...", "class_map": { "0":"ball","1":"club_head" }}}`.
