<!--COVERAGE_BADGE_START-->![coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)<!--COVERAGE_BADGE_END-->

# GolfIQ-YOLO

Project repository.

## Staging run

1) Kopiera `server/.env.example` till `server/.env` och fyll ev. värden (`YOLO_INFERENCE`, `YOLO_MODEL_PATH`, `API_KEY`, `CORS_ORIGINS`).
2) Kör staging:
   - **Windows:** `./scripts/run_staging.ps1`
   - **macOS/Linux:** `bash scripts/run_staging.sh`
3) Testa: `GET http://localhost:8000/health` → `{\"status\":\"ok\", ...}`
   Om `API_KEY` i `.env` är satt måste klienter skicka header `x-api-key: <värdet>` (ej nödvändigt för /health).

### cv_engine (mock)
Run: `GOLFIQ_MOCK=1 python -m cv_engine.cli --mock-frames 5`

### Server: /cv/mock/analyze
```bash
curl -X POST http://localhost:8000/cv/mock/analyze \
  -H "Content-Type: application/json" \
  -d '{"frames":10,"fps":120,"ref_len_m":1.0,"ref_len_px":100.0,"ball_dx_px":2,"ball_dy_px":-1}'
```

You can switch the mock analysis to the detector-driven pipeline:
```
curl -X POST http://localhost:8000/cv/mock/analyze \
  -H "Content-Type: application/json" \
  -d '{"mode":"detector","frames":10,"fps":120,"ref_len_m":1.0,"ref_len_px":100,"ball_dx_px":2,"ball_dy_px":-1}'
```

### Upload frames (ZIP) and analyze
```bash
# ZIP can contain .npy (H,W,3 uint8) and/or PNG/JPG
curl -X POST "http://localhost:8000/cv/analyze" \
  -F "fps=120" -F "ref_len_m=1.0" -F "ref_len_px=100" -F "mode=detector" \
  -F "frames_zip=@/path/to/frames.zip"
```

### Video support (optional)
Install once:

```
pip install -e ".[video]"
```

Analyze an MP4:

```
curl -X POST "http://localhost:8000/cv/analyze/video" \
  -F "video=@/path/to/clip.mp4" \
  -F "ref_len_m=1.0" -F "ref_len_px=100" -F "fps_fallback=120"
```

## Web UI

The project ships with a Vite + React single-page app for uploading captures, kicking off mock runs, and browsing persisted runs.

### Local development

```bash
cd web
npm install
npm run dev
```

Configure the backend origin with `VITE_API_BASE` (defaults to `http://localhost:8000`).

#### API-nyckel

- `VITE_API_KEY` skickas som `x-api-key` från webben.
- Dev: `VITE_API_BASE=http://localhost:8000 VITE_API_KEY=s3cret npm run dev`.

### Build & serve from FastAPI

```bash
cd web
npm run build
SERVE_WEB=1 uvicorn server.app:app --reload
```

When `SERVE_WEB=1` the FastAPI server mounts the compiled SPA from `web/dist` and serves it at `/`.

The UI currently calls the following endpoints: `/cv/mock/analyze`, `/cv/analyze`, `/cv/analyze/video`, and `/runs` (including `/runs/{id}` and `DELETE /runs/{id}`).

## Security & limits

* Set `REQUIRE_API_KEY=1` to require the header `x-api-key` to match `API_KEY` for analysis and runs endpoints.
* Uploads are bounded by defaults: ZIPs ≤ 50 MB, ≤ 400 files, compression ratio ≤ 200×, and videos ≤ 80 MB. Override with `MAX_ZIP_SIZE_BYTES`, `MAX_ZIP_FILES`, `MAX_ZIP_RATIO`, or `MAX_VIDEO_BYTES`.

### Feature flags

- `ENABLE_SPIN` (default 0) – exponerar spin-placeholders i API (värden är `null` tills en spin-modul finns).
- `CAPTURE_IMPACT_FRAMES` (default 1) – sparar ett litet `impact_preview.zip` kring första impact när `persist=true`. Tunas med `IMPACT_CAPTURE_BEFORE/AFTER`.

## Web UI

The project ships with a Vite + React single-page app for uploading captures, kicking off mock runs, and browsing persisted runs.

### Local development
```bash
cd web
npm install
npm run dev
```

#### Web auth
Set `VITE_API_KEY` to have the SPA send `x-api-key` with every request.

Dev:
```bash
cd web
VITE_API_BASE=http://localhost:8000 VITE_API_KEY=s3cret npm run dev
```

When backend runs with REQUIRE_API_KEY=1 and API_KEY=s3cret, the UI will work out-of-the-box.

## CI & Coverage

A separate workflow publishes cv_engine coverage as an artifact (report-only).
