# Staging runbook

## Minimum environment
- `APP_ENV=staging` and/or `STAGING=1`
- `REQUIRE_API_KEY=1` plus `API_KEY=<staging key>` (enables request guard)
- `ADMIN_TOKEN=<feature-flag admin secret>`
- `LIVE_SIGN_SECRET=<HLS signing secret>`
- `LIVE_VIEWER_SIGN_KEY=<viewer token signing secret>`
- `MODEL_VARIANT=yolov10` (default) – switch to `yolov11` only when the new weights are staged; the API surface stays unchanged.
- Paths (defaults baked into the image):
  - `RUN_STORE_DIR=/data/runs` (alias: `GOLFIQ_RUNS_DIR`)
  - `RUN_STORE_BACKEND=file`
  - `RUNS_UPLOAD_DIR=/data/uploads`
  - `GOLFIQ_ROUNDS_DIR=/data/rounds`
  - `GOLFIQ_BAGS_DIR=/data/bags`
  - `FEATURE_FLAGS_CONFIG_PATH=/data/config/feature_flags.json`

### Set up env file
1. Copy the example: `cp server/.env.staging.example server/.env.staging`
2. Fill in the secret values (API_KEY, ADMIN_TOKEN, LIVE_SIGN_SECRET, LIVE_VIEWER_SIGN_KEY).
3. The compose file loads `server/.env.staging` automatically; keep the file untracked.

## Starting the server
```bash
docker compose -f docker-compose.staging.yml up --build
```

To experiment with YOLOv11 in staging, override the compose environment:
```bash
MODEL_VARIANT=yolov11 docker compose -f docker-compose.staging.yml up --build
```

## Run artifact store
- Every `/cv/analyze`, `/cv/analyze/video`, and `/range/practice/analyze` call now creates a persisted run with a `run_id`, status, model variant metadata, and timing. Runs are written to `RUN_STORE_DIR` (JSON files, newest first).
- Configure the store per environment:
  ```bash
  export RUN_STORE_DIR=/data/runs       # default
  export RUN_STORE_BACKEND=file         # only supported backend today
  ```
- Inspect recent runs:
  ```bash
  curl -s "http://localhost:8000/runs/v1?limit=5" -H "x-api-key: $API_KEY"
  ```
- Filters (optional) for `/runs/v1`: `status=processing|succeeded|failed`, `kind=image|video|range`, `model_variant=yolov10`. Pagination uses `limit` (default 50, max 200) and `cursor` (opaque `created_ts:run_id` from `next_cursor` in the prior response).
- Fetch a single run (includes status, inference timing, errors, and model variant info):
  ```bash
  curl -s "http://localhost:8000/runs/${RUN_ID}" -H "x-api-key: $API_KEY" | jq
  ```
- Example run payload:
  ```json
  {
    "run_id": "1a2b3c4d-1111-2222-3333-444455556666",
    "status": "succeeded",
    "source_type": "analyze_video",
    "model_variant_selected": "yolov10",
    "override_source": "header",
    "inference_timing": {"total_ms": 182.4, "avg_ms_per_frame": 7.6, "frame_count": 24},
    "timings": {"total_ms": 182.4, "avg_inference_ms": 7.6, "frame_count": 24},
    "inputs": {"type": "video", "filename": "sample.mp4"},
    "error_code": null,
    "error_message": null,
    "created_at": "2025-01-05T12:00:00Z",
    "updated_at": "2025-01-05T12:00:00Z"
  }
  ```

## Health and readiness
- Liveness/health: `curl -s http://localhost:8000/health`
- Readiness: `curl -s -w "\n%{http_code}\n" http://localhost:8000/ready`
  - 200 => all checks passed
  - 503 => at least one check failed; payload includes `checks` with per-item status
- Error contract (run-producing endpoints): `/cv/analyze`, `/cv/analyze/video`, and `/range/practice/analyze` now return JSON `{ "run_id": "...", "error_code": "...", "message": "..." }` on failures when a run is created, alongside persisted `status=failed` in the run store.

## Feature flag admin verification
1. Ensure `ADMIN_TOKEN` is set in the container environment.
2. Fetch config:
   ```bash
   curl -H "x-admin-token: $ADMIN_TOKEN" http://localhost:8000/api/admin/feature-flags/config
   ```
3. Update rollout:
   ```bash
   curl -X PUT -H "x-admin-token: $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"roundFlowV2": {"rolloutPercent": 10}}' \
     http://localhost:8000/api/admin/feature-flags/config
   ```
4. Confirm `/ready` stays 200 after config changes to verify the store is writable.
