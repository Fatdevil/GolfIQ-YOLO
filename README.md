## Staging run

1) Kopiera `server/.env.example` till `server/.env` och fyll ev. värden (`YOLO_INFERENCE`, `YOLO_MODEL_PATH`, `API_KEY`, `CORS_ORIGINS`).
2) Kör staging:
   - **Windows:** `.\scripts\run_staging.ps1`
   - **macOS/Linux:** `bash scripts/run_staging.sh`
3) Testa: `GET http://localhost:8000/health` → `{\"status\":\"ok\", ...}`
   Om `API_KEY` i `.env` är satt måste klienter skicka header `x-api-key: <värdet>` (ej nödvändigt för /health).
