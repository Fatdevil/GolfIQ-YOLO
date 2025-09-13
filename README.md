<!--COVERAGE_BADGE_START-->![coverage](https://img.shields.io/badge/coverage-67%25-yellow)<!--COVERAGE_BADGE_END-->

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
