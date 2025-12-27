# Staging runbook

## Minimum environment
- `APP_ENV=staging` and/or `STAGING=1`
- `REQUIRE_API_KEY=1` plus `API_KEY=<staging key>` (enables request guard)
- `ADMIN_TOKEN=<feature-flag admin secret>`
- `LIVE_SIGN_SECRET=<HLS signing secret>`
- `LIVE_VIEWER_SIGN_KEY=<viewer token signing secret>`
- Paths (defaults baked into the image):
  - `GOLFIQ_RUNS_DIR=/data/runs`
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

## Health and readiness
- Liveness/health: `curl -s http://localhost:8000/health`
- Readiness: `curl -s -w "\n%{http_code}\n" http://localhost:8000/ready`
  - 200 => all checks passed
  - 503 => at least one check failed; payload includes `checks` with per-item status

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
