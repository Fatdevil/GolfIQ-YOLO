<!--COVERAGE_BADGE_START-->![coverage](https://img.shields.io/badge/coverage-75%25-yellowgreen)<!--COVERAGE_BADGE_END-->

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
