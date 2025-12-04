<!--COVERAGE_BADGE_START-->![coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)<!--COVERAGE_BADGE_END-->

# GolfIQ-YOLO

Project repository.

## Staging run

1) Kopiera `server/.env.example` till `server/.env` och fyll ev. vÃ¤rden (`YOLO_INFERENCE`, `YOLO_MODEL_PATH`, `API_KEY`, `CORS_ORIGINS`).
2) KÃ¶r staging:
   - **Windows:** `./scripts/run_staging.ps1`
   - **macOS/Linux:** `bash scripts/run_staging.sh`
3) Testa: `GET http://localhost:8000/health` â†’ `{\"status\":\"ok\", ...}`
   Om `API_KEY` i `.env` Ã¤r satt mÃ¥ste klienter skicka header `x-api-key: <vÃ¤rdet>` (ej nÃ¶dvÃ¤ndigt fÃ¶r /health).

## Operations

### Metrics & build info
- `GET /metrics` exposes Prometheus metrics (`requests_total`, `request_latency_seconds`).
- `GET /health` returns: `{"status":"ok","version":BUILD_VERSION,"git":GIT_SHA}`.
  Set in CI/release:

  ```bash
  BUILD_VERSION=$GITHUB_REF_NAME
  GIT_SHA=$GITHUB_SHA
  ```

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

### Live viewer tokens

- `LIVE_SIGN_TTL_SEC` (default `120`) controls the TTL in seconds for signed viewer URLs. Tokens automatically refresh when
  ~30 seconds from expiry.
- `LIVE_SIGN_SECRET` holds the HMAC key used when signing viewer URLs; set to a random hex string in production.

### Courses / GPS (MVP)

- `GET /api/courses` lists available demo course bundle identifiers.
- `GET /api/courses/{id}/bundle` returns a bundled payload for one course (holes, green front/middle/back, hazards, optional bbox).

These endpoints currently serve static in-memory data for a small demo set so clients can integrate ahead of the full PostGIS-backed catalogue.

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

- `VITE_API_KEY` skickas som `x-api-key` frÃ¥n webben.
- Dev: `VITE_API_BASE=http://localhost:8000 VITE_API_KEY=s3cret npm run dev`.

### Build & serve from FastAPI

```bash
cd web
npm run build
SERVE_WEB=1 uvicorn server.app:app --reload
```

When `SERVE_WEB=1` the FastAPI server mounts the compiled SPA from `web/dist` and serves it at `/`.

The UI currently calls the following endpoints: `/cv/mock/analyze`, `/cv/analyze`, `/cv/analyze/video`, and `/runs` (including `/runs/{id}` and `DELETE /runs/{id}`).

### Access plans & feature flags

- `GET /api/access/plan` returns `{ "plan": "free" | "pro" }`. Plans default to `free` but can be overridden with:
  - `GOLFIQ_DEFAULT_PLAN` – sets the baseline plan for all API keys.
  - `GOLFIQ_PRO_API_KEYS` – comma separated list of API keys that should be treated as `pro` regardless of the default.
- The web app wraps `<App />` with `UserAccessProvider`. Components can call `useFeatureFlag(featureId)` or wrap content in `<FeatureGate feature="…">` to show upgrade teasers.
- `ProBadge` renders a small badge for pro-only surfaces. Advanced UI sections (GhostMatch, Caddie hints, profile insights) now respect these feature gates.

### Internationalization (i18n)

- The web app uses [`react-i18next`](https://react.i18next.com/) with JSON resources under `web/src/locales/{lang}/common.json`.
- English (`en`) is the default (and current) language. The preference is stored in `localStorage["golfiq.lang"]`.
- To add another language, create a new `common.json` under `web/src/locales/<lang>/`, extend `web/src/i18n.ts` with the resources, and update `SUPPORTED_LANGS` in `web/src/components/LanguageSelector.tsx`.

#### Quick Round

- Auto hole detect (beta): when a course bundle is selected and GPS is enabled, the web app can suggest switching to the correct hole based on your location, and you confirm via a “Byt / Ignorera” toast. The heuristic is intentionally conservative and currently relies on the static demo course bundles.

### CV / Range tooling

- Range Practice (beta) is available at `/range/practice`. The web client now talks to `/range/practice/analyze`, which selects the configured CV backend and returns normalized metrics together with camera fitness details.
- Range Games (beta) on `/range/practice`: Target Bingo around a chosen distance, a spray heatmap of your session, and a one-click share summary.
- GhostMatch (beta) – in Target Bingo you can save a session as a ghost and later compare your hit rate and average error against that ghost in a simple "You vs Ghost" scoreboard.
- Min bag & Gapping (beta) – configure your clubs under `/bag` and use the Gapping mode on `/range/practice` to update real carry distances.

`RANGE_PRACTICE_CV_BACKEND` controls which analyzer is used in the range practice API (`mock` by default, set to `real` to enable the live CV pipeline). When the real backend is active the Range Practice header surfaces a camera fitness badge with actionable hints (low FPS, blur/light, meters-per-pixel).

### Calibration wizard

* Open the **Calibration** tab in the web UI and upload a still image from your capture setup (keep the camera square to the target line for the cleanest scale).
* Pick a reference distance â€“ an A4 edge, a full driver (â‰ˆ1.12 m) or enter a custom length â€“ then click the matching start/end points in the frame.
* Enter the capture FPS (aim for 120+). The wizard calls `POST /calibrate/measure` and reports meters-per-pixel together with quality hints.
* If the quality badge warns about low FPS or blur, raise the frame rate and/or shorten exposure by adding light.
* Hit **Use in session** to store the calibration in localStorage (badge â€œCalibrated âœ“â€ appears in the nav).

## Security & limits

* Set `REQUIRE_API_KEY=1` to require the header `x-api-key` to match `API_KEY` for analysis and runs endpoints.
* Uploads are bounded by defaults: ZIPs â‰¤ 50 MB, â‰¤ 400 files, compression ratio â‰¤ 200Ã—, and videos â‰¤ 80 MB. Override with `MAX_ZIP_SIZE_BYTES`, `MAX_ZIP_FILES`, `MAX_ZIP_RATIO`, or `MAX_VIDEO_BYTES`.

### Feature flags

- `ENABLE_SPIN` (default 0) â€“ exponerar spin-placeholders i API (vÃ¤rden Ã¤r `null` tills en spin-modul finns).
- `CAPTURE_IMPACT_FRAMES` (default 1) â€“ sparar ett litet `impact_preview.zip` kring fÃ¶rsta impact nÃ¤r `persist=true`. Tunas med `IMPACT_CAPTURE_BEFORE/AFTER`.

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

## CaddieCore v1 -- dispersion->klubbrek + explain-score
**Endpoint:** `POST /caddie/recommend`

### Request payload
```json
{
  "player": {
    "player_id": "demo1",
    "clubs": ["7i", "6i", "PW"],
    "handicap_index": null
  },
  "shot_samples": [
    {"club": "7i", "carry_m": 150.0, "lateral_m": -3.0},
    {"club": "7i", "carry_m": 153.0, "lateral_m": 2.0},
    {"club": "6i", "carry_m": 163.0, "lateral_m": 1.0}
  ],
  "target": {
    "target_distance_m": 152,
    "elevation_delta_m": -3,
    "wind_speed_mps": 4.0,
    "wind_direction_deg": 340,
    "lie_type": "fairway",
    "hazard_distance_m": 145
  },
  "scenario": "range"
}
```

### Response payload
```json
{
  "recommendation": {
    "club": "7i",
    "conservative_club": "6i",
    "carry_p50_m": 151,
    "carry_p80_m": 156,
    "safety_margin_m": 6,
    "confidence": "medium",
    "hazard_flag": true
  },
  "explain_score": [
    {"name": "target_gap", "weight": 0.38, "direction": "positive"},
    {"name": "wind_effect", "weight": 0.27, "direction": "negative"},
    {"name": "dispersion_margin", "weight": 0.22, "direction": "positive"}
  ],
  "telemetry_id": "cad-001",
  "generated_at": "2025-09-23T19:55:00Z"
}
```

### Modell och parametrar
- Dispersion: normalfordelning per klubb med mu = `carry_mean`, sigma = `carry_std`, lateral-sigma = `lateral_std`.
- Primarrekommendation: `carry_mean + CADDIE_KSIGMA_MAIN * carry_std` maste klara maldistansen.
- Konservativt alternativ: anvander `CADDIE_KSIGMA_CONSERVATIVE` och `CADDIE_HAZARD_BUFFER_M` nar hazard-risk finns.
- Vindjustering: `CADDIE_WIND_HEAD_COEF` for motvind, `CADDIE_WIND_TAIL_COEF` for medvind, `CADDIE_WIND_CROSS_LATERAL_M_PER_MS` for sidvindsmarginal.
- Hoijdjustering: `delta_m * CADDIE_ELEVATION_PER_M` laggs pa avstandet.
- Lie-pafoljd: rough ger extra `CADDIE_LIE_ROUGH_EXTRA_M` meter samt `CADDIE_LIE_ROUGH_EXTRA_SIGMA` i sigma.

### Konstitutionens gates
- **Test & Quality:** backend-tackning >=70 %, kontrakt + integrationstester (`server/tests/test_caddie_*`).
- **Performance & UX:** P95 <50 ms (se `tests/perf/profile_caddie_recommend.py`).
- **Security & Compliance:** `bandit` och `pip-audit` utan HIGH, inga secrets i payload eller loggar.
- **Observability:** `/health` rapporterar caddie_core readiness, Prometheus-metriker `caddie_recommend_latency_ms`, `caddie_recommend_requests_total`, `caddie_recommend_factors_count`, loggar med `telemetry_id`.

### Snabbstart
1. `python scripts/seed_caddie_demo.py --input tests/fixtures/caddie_core/demo_shots.json`
2. `uvicorn server.app:app --reload`
3. `curl -X POST http://localhost:8000/caddie/recommend -H "Content-Type: application/json" -d @specs/001-feature-caddiecore-v1/contracts/examples/range_request.json`
4. Kontrollera `/metrics` och `/health` for nya Prometheus-varden och build-info.
5. Kor `pytest server/tests/test_caddie_*` och bekrafta att coverage-rapporten i CI ligger >=70 %.
