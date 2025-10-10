# GolfIQ-YOLO Repository Map (2025-10-09)

## Server (FastAPI)
- **Entry point:** `server/app.py` wires core middleware (API-key guard, retention sweeper) and exposes `/health`, `/metrics`, CV analysis/upload, calibration, provider, course bundle, and run management routes.
- **Runs & storage:** `server/routes/runs*.py` and `server/storage` handle persisted run metadata/assets, plus the flight-recorder integration.
- **Telemetry:** `server/routes/ws_telemetry.py` with `server/flight_recorder.py` maintains the WebSocket channel and recording pipeline.
- **CV mock override:** `server/routes/cv_*` respect the `CV_MOCK` flag via headers/query, while preserving the `x-cv-source` header.

## CV Engine
- **Pipeline:** `cv_engine/pipeline` orchestrates inference → detection → impact/kinematics → metrics, leveraging modules under `cv_engine/impact`, `cv_engine/metrics`, and `cv_engine/utils`.
- **Tracking & pose:** `cv_engine/tracking` hosts trackers (identity/bytetrack/norfair) selected by `GOLFIQ_TRACKER`; `cv_engine/pose` provides adapters and analytics.
- **Calibration & IO:** Inputs/outputs (`cv_engine/io`) and calibration helpers ensure consistent camera frames and serialization.
- **Testing:** Synthetic + regression coverage lives in `cv_engine/tests`.

## Web & Client Apps
- **Web SPA:** `web/` (Vite + React + Tailwind) renders upload flows, result cards, and ghost trajectory overlays.
- **Expo/mobile stubs:** Platform harnesses live in `android/` (Jetpack Compose) and `ios/` (SwiftUI) with bench runners and telemetry logging.
- **Shared telemetry:** `shared/` and `observability/` host cross-platform helpers for metrics export.

## AR HUD & Simulation
- **HUD core:** `arhud/` contains compositor, gesture, distance, and pose adapters for the AR-HUD MVP.
- **Simulation:** `arhud/simulation` provides stubbed data for field testing and validation.

## Tooling & Workflows
- **Scripts:** `scripts/` and `tools/` automate exports, data prep, and CI utilities.
- **CI/CD:** `.github/workflows/` split Python, JS/TS, and mobile pipelines with coverage gates and artifact uploads.
- **Docs & Reports:** `reports/` consolidates accuracy benchmarks, repo map, and future analytics (edge benchmark report forthcoming).

## Tests
- **Server tests:** `server/tests` cover API routes, retention jobs, and security guards.
- **Integration:** `tests/` houses end-to-end scenarios across upload/run life cycles and telemetry.
- **Video extras:** Optional heavy video-based validations remain opt-in to keep CI fast.
