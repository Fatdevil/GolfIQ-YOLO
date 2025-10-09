# GolfIQ-YOLO Repository Map

## Server & APIs
- **FastAPI app**: `server/app.py` wires middleware, API key guard, Prometheus metrics (`/metrics`), `/health`, CV analysis/upload routes, run storage endpoints, and the WebSocket telemetry flight-recorder in `server/routes/ws_telemetry.py`.
- **Routes**: `server/routes/` contains CV endpoints (mock + real, ZIP/MP4 upload), run management (`runs.py`, `runs_upload.py`), provider integration, and course bundle handlers. `server/flight_recorder.py` persists telemetry streams.
- **Security & Retention**: `server/security.py` provides API-key validation; `server/retention/` sweeps old runs.

## CV Engine
- **Pipeline**: `cv_engine/pipeline/` orchestrates detection → tracking → kinematics → persistence with `CV_MOCK` overrides (query/header) handled server-side.
- **Tracking**: `cv_engine/tracking/` hosts tracker adapters (identity/ByteTrack/Norfair) selected via `GOLFIQ_TRACKER`.
- **Metrics & Impact**: `cv_engine/impact/` and `cv_engine/metrics/` compute ball/club metrics, launch, carry, and quality scores; new sliding-window helpers live in `cv_engine/metrics/kinematics.py`.
- **Pose**: `cv_engine/pose/` includes the adapter toggled by `POSE_BACKEND` and backend stubs (MediaPipe/MoveNet).

## Clients & UI
- **Web SPA**: `web/` React client renders upload flow, result cards, and ghost trajectory overlay.
- **Mobile Stubs**: `android/` (Jetpack Compose) and `ios/` (SwiftUI) house harness scaffolding for edge benchmarks.
- **AR HUD**: `arhud/` prototypes heads-up display flows and sensor fusion experiments.

## Observability & Tooling
- **Metrics & Telemetry**: Prometheus exporter under `server/metrics/`, OpenTelemetry wiring in `observability/`, and Grafana configs in `observability/grafana/`.
- **Scripts**: `scripts/` holds automation (exports, maintenance) with CI helpers in `.github/workflows/` splitting JS/TS vs Python pipelines.

## Tests & Contracts
- **Python tests**: `cv_engine/tests/` and `server/tests/` cover pipeline accuracy, run storage, and telemetry. Video extras stay opt-in.
- **Contracts**: `contracts/` contains API and data contracts; `docs/` collects reports (accuracy, plays-like validation).

## Storage & Data
- **Run storage**: `server/storage/` manages persisted run metadata, linking to `data/` samples for local validation.
- **Artifacts**: `artifacts/` and `exports/` house generated assets; cleaned by retention jobs.
