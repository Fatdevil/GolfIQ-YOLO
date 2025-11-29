# GolfIQ-YOLO – Current Build Inventory

- **Date of scan:** 2025-11-28
- **Git commit:** 5540f71

## High-Level Summary
GolfIQ-YOLO combines a FastAPI backend with React web tooling and native watch/phone bridges to ingest golf telemetry, manage events/runs, and deliver HUD guidance to wearable devices. The backend exposes routes for CV analysis, course bundles, live events, watch/HUD control, caddie analytics, sharing, and telemetry streaming, backed primarily by filesystem storage for runs and optional flight-recorder dumps. The web frontend surfaces run analytics, live event dashboards, bag/profile management, range tools, and trip scoreboards while calling the API via a shared axios/fetch client. WatchOS, iOS (React Native bridge), and Android Wear modules exchange HUD snapshots and commands using WatchConnectivity/Google Play Services data and message channels.

## Backend Overview

### Endpoints
| Method | Path | File | Description | Key models |
| --- | --- | --- | --- | --- |
| GET | /health | server/app.py | Basic health probe. | – |
| GET | /metrics | server/app.py | Prometheus metrics export. | – |
| GET | /protected | server/app.py | API-key-protected liveness check. | – |
| POST | /analyze | server/app.py | Placeholder analyze status. | – |
| POST | /cv/mock/analyze | server/routes/cv_mock.py | Generate synthetic run events/metrics, optional persistence. | AnalyzeResponse |
| POST | /cv/analyze | server/routes/cv_analyze.py | Analyze uploaded frame bundle for metrics. | AnalyzeResponse |
| POST | /cv/analyze/video | server/routes/cv_analyze_video.py | Analyze uploaded video for launch/club metrics. | AnalyzeResponse |
| POST | /range/practice/analyze | server/routes/range_practice.py | Analyze practice session frames. | RangeAnalyzeOut |
| POST | /calibrate/measure | server/routes/calibrate.py | Compute meters-per-pixel calibration metrics. | MeasureRes |
| GET | /calibrate | server/api/routers/calibrate.py | Legacy calibration resource endpoint. | – |
| GET | /runs | server/routes/runs.py | List recent run summaries from filesystem. | RunListItem |
| GET | /runs/{run_id} | server/routes/runs.py | Load stored run details. | RunResponse |
| DELETE | /runs/{run_id} | server/routes/runs.py | Delete stored run directory. | – |
| POST | /runs/hud | server/routes/runs_upload.py | Save HUD artifacts for a run upload. | – |
| POST | /runs/round | server/routes/runs_upload.py | Register round metadata for upload. | – |
| GET | /runs/{run_id} (uploads) | server/routes/runs_upload.py | Fetch upload metadata for a run. | UploadSession |
| POST | /runs/upload-url | server/routes/runs_upload.py | Presign ZIP upload via storage provider. | PresignResponse |
| POST | /runs/upload | server/routes/runs_upload.py | Direct ZIP upload to server storage. | – |
| GET | /courses | server/routes/course_bundle.py | List available courses. | CourseSummary |
| GET | /course/{course_id} | server/routes/course_bundle.py | Fetch course definition. | Course |
| GET | /course/{course_id}/holes | server/routes/course_bundle.py | List holes for a course. | Hole |
| GET | /course/{course_id}/holes/{hole_number} | server/routes/course_bundle.py | Hole detail. | Hole |
| POST | /bundle/course/{course_id} | server/routes/bundle.py | Build and persist bundled course package. | – |
| GET | /bundle/index | server/routes/bundle_index.py | Index of bundled courses. | BundleIndexItem |
| GET | /api/courses | server/api/routers/courses.py | List demo courses. | list[str] |
| GET | /api/courses/{id}/bundle | server/api/routers/courses.py | Course bundle payload. | CourseBundle |
| GET | /api/courses/hero | server/api/routers/courses.py | Hero course summaries with tee data. | HeroCourseSummary |
| POST | /events | server/routes/events.py | Create event with join code/QR. | EventCreateResponse |
| POST | /join/{code} | server/routes/events.py | Join event by code. | JoinEventRequest |
| POST | /events/{event_id}/add-player | server/routes/events.py | Add player to event. | – |
| GET | /events/{event_id}/board | server/routes/events.py | Spectator leaderboard state. | BoardResponse |
| GET | /events/{event_id}/host | server/routes/events.py | Host view state. | HostStateResponse |
| POST | /events/{event_id}/start | server/routes/events.py | Start live round. | HostStateResponse |
| POST | /events/{event_id}/pause | server/routes/events.py | Pause live round. | HostStateResponse |
| POST | /events/{event_id}/close | server/routes/events.py | Close event. | HostStateResponse |
| POST | /events/{event_id}/code/regenerate | server/routes/events.py | Rotate join code. | HostStateResponse |
| PATCH | /events/{event_id}/settings | server/routes/events.py | Update event configuration. | HostStateResponse |
| GET | /events/{event_id}/host_session | server/routes/events_session.py | Return session summary for host. | EventSessionResponse |
| GET | /events/{event_id}/join/{code} | server/routes/events.py | Join via event/id+code. | JoinEventResponse |
| POST | /events/{event_id}/board/ack | server/routes/events.py | Ack board updates. | – |
| GET | /join/{code} | server/routes/events.py | Fetch event metadata by code. | JoinEventResponse |
| POST | /live/heartbeat | server/routes/live.py | Heartbeat updating live state. | LiveState |
| GET | /live | server/routes/live.py | Current live state snapshot. | LiveState |
| POST | /live/start | server/routes/live.py | Start live session. | LiveState |
| POST | /live/stop | server/routes/live.py | Stop live session. | LiveState |
| POST | /live/token | server/routes/live.py | Issue viewer/host token. | LiveToken |
| GET | /live/status | server/routes/live.py | Status ping. | LiveStatus |
| GET | /live/viewer_link | server/routes/live.py | Signed viewer link for token. | ViewerLink |
| POST | /live/exchange_invite | server/routes/live.py | Exchange invite token. | ViewerLink |
| POST | /api/events/{event_id}/live/viewer-token | server/api/routers/live_tokens.py | Create viewer token (API namespace). | ViewerTokenOut |
| GET | /api/events/{event_id}/live/refresh | server/api/routers/live_tokens.py | Refresh viewer token. | RefreshOut |
| GET | /api/access/plan | server/api/routers/access.py | Current access plan/trial state. | AccessPlan |
| POST | /api/share/anchor | server/api/routers/share.py | Create share anchor token. | – |
| GET | /s/{sid} | server/api/routers/share.py | Resolve share link. | – |
| GET | /s/{sid}/o | server/api/routers/share.py | Open/redirect share link. | – |
| GET | /api/share/{sid} | server/api/routers/share.py | Fetch share payload by token. | – |
| POST | /api/runs/{run_id}/score | server/api/routers/run_scores.py | Persist run score metrics. | – |
| POST | /api/caddie/advise | server/api/routers/caddie.py | Return club/plays-like recommendation. | AdviseOut |
| GET | /api/caddie/insights | server/routes/caddie_insights.py | Aggregated caddie usage/trust stats. | CaddieInsights |
| POST | /api/caddie/telemetry | server/routes/caddie_telemetry.py | Store incoming caddie telemetry. | CaddieTelemetryIn |
| GET | /api/coach/round-summary/{run_id} | server/api/routers/coach.py | Coach SG preview and highlights. | CoachRoundSummary |
| GET | /api/coach/diagnosis/{run_id} | server/api/routers/coach.py | Diagnosis for run. | CoachDiagnosis |
| POST | /api/coach/share/{run_id} | server/api/routers/coach.py | Generate shareable coach report. | CoachShareResponse |
| POST | /coach | server/api/routers/coach.py | Create coach entity. | CoachResponse |
| POST | /coach/feedback | server/api/routers/coach_feedback.py | Submit coach feedback. | CoachFeedbackResponse |
| GET | /api/analytics/player | server/api/routers/analytics.py | Player analytics trends/missions. | PlayerAnalytics |
| GET | /api/profile/player | server/api/routers/profile.py | Player profile + plan. | PlayerProfile |
| GET | /api/sg/run/{run_id} | server/routes/sg_preview.py | Stroke-gain preview for run. | RoundSgPreview |
| GET | /api/sg/member/{member_id} | server/routes/sg_summary.py | Member SG summary. | MemberSgSummary |
| GET | /api/runs/{run_id}/sg | server/api/routers/sg.py | SG data for run. | RunSG |
| POST | /api/sg/runs/{run_id}/anchors | server/api/routers/sg.py | Create SG anchors. | SGAnchor |
| GET | /api/sg/runs/{run_id}/anchors | server/api/routers/sg.py | List SG anchors. | SGAnchor |
| POST | /bench/edge | server/routes/bench.py | Submit edge benchmark results. | – |
| GET | /bench/summary | server/routes/bench.py | Aggregate benchmark summaries. | BenchSummary |
| GET | /home | server/routes/feed.py | Return feed/home recommendations. | HomeResponse |
| POST | /clips | server/routes/clips.py | Submit clip moderation action. | – |
| POST | /clips/events | server/routes/clips.py | Register clip events. | – |
| POST | /commentary/templates | server/routes/commentary.py | Register commentary templates. | – |
| GET | /commentary/templates | server/routes/commentary.py | List commentary templates. | – |
| GET | /commentary/rewrite | server/routes/commentary.py | Rewrite commentary text. | CommentaryOut |
| GET | /providers/elevation | server/routes/providers.py | Elevation lookup for coordinates. | – |
| GET | /providers/wind | server/routes/providers.py | Wind lookup for coordinates. | – |
| GET | /models/manifest.json | server/routes/models.py | List CV models manifest. | – |
| GET | /rollout/health | server/routes/rollout.py | Rollout service health. | – |
| POST | /issues | server/routes/issues.py | Create issue ticket. | Issue |
| GET | /issues/{issue_id} | server/routes/issues.py | Fetch issue. | Issue |
| POST | /api/watch/hud/hole | server/api/routers/watch_hud.py | Full HUD snapshot per hole. | HoleHud |
| POST | /api/watch/hud/tick | server/api/routers/watch_hud.py | HUD delta update. | TickOut |
| POST | /api/watch/pair/code | server/api/routers/watch_pairing.py | Create pairing code. | PairCode |
| POST | /api/watch/devices/register | server/api/routers/watch_pairing.py | Register watch device. | RegisterOut |
| POST | /api/watch/devices/bind | server/api/routers/watch_pairing.py | Bind device to member via code. | TokenOut |
| POST | /api/watch/devices/token | server/api/routers/watch_pairing.py | Refresh device token. | TokenOut |
| GET | /api/watch/devices/stream | server/api/routers/watch_pairing.py | SSE stream of device notifications. | – |
| POST | /api/watch/devices/ack | server/api/routers/watch_pairing.py | Ack device notifications. | – |
| POST | /api/watch/quickround/sync | server/api/routers/watch_quickround.py | Sync quick round HUD to paired device. | QuickRoundSyncOut |
| POST | /api/watch/{member_id}/tips | server/api/routers/watch_tips.py | Submit tip for member. | – |
| GET | /api/watch/{member_id}/tips/stream | server/api/routers/watch_tips.py | SSE stream of tips. | – |
| POST | /api/events/{event_id}/live/viewer-token | server/api/routers/live_tokens.py | Viewer token issuance. | ViewerTokenOut |
| GET | /api/events/{event_id}/live/refresh | server/api/routers/live_tokens.py | Viewer token refresh. | RefreshOut |
| POST | /telemetry | server/routes/ws_telemetry.py | Broadcast telemetry sample; optional flight recording. | Telemetry |
| POST | /telemetry/batch | server/routes/ws_telemetry.py | Accept batch telemetry samples. | TelemetrySample |
| WS | /ws/telemetry | server/routes/ws_telemetry.py | WebSocket broadcast channel for telemetry consumers. | Telemetry |
| POST | /media/sign | server/routes/media.py | Sign media upload/download URLs. | – |
| POST | /recommend | server/routes/caddie_recommend.py | Generate recommendation response. | RecommendationResponseBody |
| GET | /api/hole/detect | server/routes/hole_detect.py | Auto hole detection. | HoleDetectResponse |
| GET | /api/hole/detect (legacy) | server/api/routers/hole_detect.py | Hole detection via API router. | HoleDetectOut |
| GET | /api/watch/devices/ack | server/api/routers/watch_pairing.py | (alias via decorator) Ack notifications. | – |
| POST | /api/watch/devices/register_token | server/api/routers/watch_pairing.py | Register device token shortcut. | TokenOut |
| POST | /api/watch/devices/push_metrics | server/routes/caddie_health.py | Post device health metrics. | CaddieHealthResponse |

### Domain models
- **RunRecord** – `server/storage/runs.py`; filesystem JSON per run with `run_id`, `created_ts`, `source`, `mode`, `params`, `metrics`, `events`, optional `impact_preview`. Stored under `data/runs/{run_id}` with helper CRUD functions.
- **Telemetry & TelemetrySample** – `server/schemas/telemetry.py`; real-time telemetry with fields such as `timestampMs`, `club`, `ballSpeed`, `carryMeters`, optional `device/runtime/feedback`, plus ingestion batch samples (`session_id`, `ts`, `frame_id`, `impact`, `ball/club/launch` dictionaries). Used by telemetry endpoints and flight recorder.
- **HoleHud & TickOut** – `server/api/routers/watch_hud.py`; HUD payload includes hole number, yardages (`toGreen_m`, `toFront_m`, `toBack_m`), plays-like adjustments, wind/temp/elevation, active tip and caddie confidence flags; TickOut carries lighter-weight periodic updates including location.
- **AccessPlan** – `server/api/routers/access.py`; denotes subscription plan (`plan`, `trial`, `expires_at`). Stored in-memory/config-driven.
- **CourseBundle / HeroCourseSummary** – `server/api/routers/courses.py`; course bundles include tee/hole metadata and TTL; hero summaries provide curated courses with tees/lengths. Loaded from bundle files.

### Background jobs / schedulers
- **Retention sweeper** – `server/app.py`; startup lifespan task loops every 5 minutes sweeping directories in `RETENTION_DIRS` and deleting uploads older than `RUNS_TTL_DAYS` under `RUNS_UPLOAD_DIR`. Controlled by env vars.
- **Flight recorder sampling** – `server/routes/ws_telemetry.py` uses `FLIGHT_RECORDER_PCT` and `FLIGHT_RECORDER_DIR` to probabilistically persist telemetry messages for debugging.

## Web Frontend Overview

### Routes/Pages
| Route | Component | Description | Backend calls (if visible) |
| --- | --- | --- | --- |
| / | web/src/pages/home/HomeHubPage.tsx | Home hub dashboard cards. | Various feed/event fetches via api client. |
| /feed | web/src/pages/home/HomeFeed.tsx | Legacy feed list. | GET /home |
| /analyze | web/src/pages/Analyze.tsx | Upload/analyze run footage. | POST /cv/analyze / cv_mock |
| /calibration | web/src/pages/Calibration.tsx | Calibration workflow. | POST /calibrate/measure |
| /mock | web/src/pages/MockAnalyze.tsx | Mock analysis UI. | POST /cv/mock/analyze |
| /runs | web/src/pages/Runs.tsx | List stored runs. | GET /runs |
| /runs/:id | web/src/pages/RunDetail.tsx | Run detail view with events. | GET /runs/{id} |
| /share/:id | web/src/pages/ShareRun.tsx | Shareable run view. | GET /s/{id} |
| /event/:id | web/src/pages/EventLeaderboard.tsx | Event leaderboard display. | GET /events/{id}/board |
| /events/new | web/src/pages/events/new.tsx | Create new event with name/emoji. | POST /events |
| /events/:id/live | web/src/pages/events/LiveViewerPage.tsx | Live viewer scoreboard (session boundary). | Live API via EventSessionBoundary |
| /events/:id/live/leaderboard | web/src/pages/events/[id]/live.tsx | Live leaderboard TV view. | GET /events/{id}/board |
| /events/:id/live-host | web/src/pages/events/[id]/live-host.tsx | Host controls for live round. | POST /events/{id}/start/pause/close |
| /events/:id/live-view | web/src/pages/events/[id]/live-view.tsx | Viewer overlay view. | Live endpoints |
| /events/:id/admin/clips | web/src/pages/events/[id]/admin/clips.tsx | Clip admin queue. | /clips routes |
| /events/:id/admin/moderation | web/src/pages/events/[id]/admin/moderation.tsx | Clip moderation UI. | moderation endpoints |
| /events/:id/top-shots | web/src/pages/events/[id]/top-shots.tsx | Top shots board. | sg/analytics endpoints |
| /join(/:code) | web/src/pages/join/[code].tsx | Join event by code. | POST /join/{code} |
| /:eventId/live/:roundId | web/src/routes/live/[eventId]/[roundId].tsx | Live round viewer route. | Live API |
| /field-runs | web/src/pages/FieldRuns.tsx | Field runs listing. | GET /runs |
| /device-dashboard | web/src/pages/DeviceDashboard.tsx | Device connection dashboard. | watch pairing APIs |
| /accuracy | web/src/pages/accuracy/index.tsx | Accuracy dashboard. | metrics endpoints |
| /admin/feedback | web/src/pages/FeedbackAdmin.tsx | Review coach feedback submissions. | /coach/feedback |
| /reels | web/src/pages/ReelsComposer.tsx | Reels/video composer. | media/upload APIs |
| /range/practice | web/src/pages/RangePracticePage.tsx | Range practice capture/upload. | POST /range/practice/analyze |
| /range/score | web/src/pages/range/score.tsx | Range scoring summary. | sg/analytics APIs |
| /profile | web/src/pages/profile/MyGolfIQPage.tsx | Player profile view. | GET /api/profile/player |
| /bag | web/src/pages/bag/MyBagPage.tsx | Bag management. | bag endpoints (client-side) |
| /settings | web/src/pages/settings/SettingsPage.tsx | Toggle feature flags/preferences. | local storage |
| /courses/demo | web/src/pages/courses/CourseDemoPage.tsx | Course demo viewer. | GET /api/courses/hero |
| /dev/caddie-insights | web/src/pages/dev/CaddieInsightsPreviewPage.tsx | Preview caddie insights. | GET /api/caddie/insights |
| /dev/hud-preview | web/src/pages/dev/HudPreviewPage.tsx | HUD preview playground. | POST /api/watch/hud/hole |
| /play | web/src/pages/quick/QuickRoundStartPage.tsx | Start quick round flow. | watch quickround sync |
| /play/:roundId | web/src/pages/quick/QuickRoundPlayPage.tsx | Quick round HUD updates. | watch quickround sync |
| /trip/start | web/src/pages/trip/TripStartPage.tsx | Start trip/round sharing. | POST /trip rounds |
| /trip/:tripId | web/src/pages/trip/TripScoreboardPage.tsx | Trip scoreboard for participants. | GET /trip/rounds/{id} |
| /trip/share/:token | web/src/pages/trip/PublicTripScoreboardPage.tsx | Public trip scoreboard. | GET /trip_public/rounds/{token} |
| /coach/share/:sid | web/src/pages/coach/CoachShareReportPage.tsx | View coach share report. | GET /api/share/{sid} |
| /qa/replay | web/src/pages/ReplayAnalyzer.tsx | QA replay tool (feature-flag). | telemetry upload |

### Shared components and state
- **API client** – `web/src/api.ts`; axios/fetch wrapper injecting `VITE_API_BASE` and `VITE_API_KEY`, plus helper types for course bundles, HUD queries, event creation.
- **Navigation** – `web/src/components/Nav.tsx`; top navigation used globally.
- **EventSessionBoundary** – `web/src/session/EventSessionBoundary.tsx`; provides event session context and live polling for nested pages.
- **Media/CDN** – `web/src/media/cdn.ts`; preconnect hooks for CDN assets.
- **Overlay player** – `web/src/player/PlayerOverlay.tsx`; renders persistent overlay player UI.
- **Config flags** – `web/src/config.ts`; feature toggles for plays-like, QA replay, upload retries, SG weighting, etc.

## Watch / HUD / Mobile Bridges
- **watchOS HUD app** (`watchos/WatchHUDApp.swift`, `watchos/WatchHUDModel.swift`, `watchos/SessionDelegate.swift`): Receives HUD context via `WCSession` application context/messages (`golfiq_hud_v1`), displays hole distances/mini-map views, and sends phone-bound messages (e.g., roundSaved, caddie advice) through `SessionDelegate`.
- **iOS React Native bridge** (`ios/WatchConnectorIOS.swift`/`.m`): Exposes methods `isCapable`, `sendHUDB64`, `sendOverlayJSON`, `sendMessage` to JS; uses `WCSession` to send HUD context and overlay JSON to watch, and emits events (`watch.imu.v1`, `watch.message.v1`) from watch messages.
- **Android Wear bridge** (`android/app/src/main/java/com/golfiq/watch/WatchConnectorModule.kt`, `VectorWatchBridgeModule.kt`, `HudCodec.kt`): React Native module leveraging Google Play Services Wearable APIs to send HUD payloads (data layer), overlay JSON, control ShotSense streaming via messages, and generic watch messages; checks capability via reachable nodes.
- **HUD Overlay bridge** (`arhud/` and `watchos/OverlayMiniBridge.swift`): Overlay mini-bridge for HUD rendering and debugging flows; uses shared models to mirror HUD overlays.
- **GolfIQ Play (mobile)** (`apps/mobile/src/screens/HomeScreen.tsx` and `apps/mobile/src/screens/play`): Start Round flow with hero course selection, tee + 9/18 pickers, local `currentRun` persistence, and a basic in-round hole overview powered by `/api/courses` endpoints.
- **GolfIQ Play mobile: strokeplay v1**: In-round scorecard (strokes/putts/FIR/GIR), finish-round confirmation, backend run + score submission, and a cached last-round summary surfaced on Home with a Round Saved placeholder view.

## Telemetry, Storage & Metrics
- **Telemetry ingestion** – `server/routes/ws_telemetry.py` exposes WebSocket `/ws/telemetry` for broadcast and HTTP `/telemetry`/`/telemetry/batch` for posting samples. Payload validated via `Telemetry`/`TelemetrySample` schema; messages broadcast to connected clients and optionally persisted by flight recorder.
- **Run storage** – `server/storage/runs.py` saves runs under `data/runs` with JSON metadata and optional `impact_preview.zip`; supports list/load/delete helpers used by `/runs` endpoints.
- **Uploads** – `server/routes/runs_upload.py` handles HUD assets, round registration, presigned URLs via `server/storage/s3signer.py`, and direct uploads.
- **Metrics middleware** – `server/metrics.py` provides `MetricsMiddleware` collecting request timings and exposes Prometheus app used at `/metrics`.
- **Caddie telemetry & health** – `server/routes/caddie_telemetry.py` stores telemetry for caddie insights; `server/routes/caddie_health.py` tracks device health metrics and exposes `/health` summary.

## CI/CD, Tests & Coverage
- **Workflows** (`.github/workflows`):
  - `ci.yml` runs lint/tests across backend and web; `web.yml` builds web assets.
  - Mobile pipelines (`android-ci.yml`, `android-release.yml`, `ios-ci.yml`, `ios-build.yml`, `mobile-beta.yml`) for native builds.
  - Quality gates: `cv-engine-coverage.yml`/`accuracy-gate.yml`/`edge-bench.yml`/`rollout-health.yml` monitor CV accuracy and rollout health; `static-analysis.yml` runs lint/static checks; `pr-binary-guard.yml` prevents binaries; `golden-regression.yml` and `retention-hud-snapshots.yml` handle visual/retention checks.
  - Release/tag workflows (`release.yml`, `tag-release.yml`, `release-v1_2.yml`, `store-assets.yml`) manage packaging and artifact exports; `inventory-audit.yml` updates inventories.
- **Tests**: Backend tests under `server/tests` (API/logic), additional tooling tests under `tests/` and `watchosTests`; frontend unit tests in `web/src/__tests__` plus Vitest config. Coverage focus includes CV pipelines, telemetry tools, and HUD rendering; no strict coverage threshold noted in repo root.

## Environment & Configuration
| Variable | Description | Where used |
| --- | --- | --- |
| API_KEY | Optional API key required for protected routes. | server/app.py (_api_key_dependency) |
| CORS_ALLOW_ORIGINS | Comma-separated origins for CORS. | server/app.py |
| RETENTION_DIRS | Directories to sweep for retention cleanup. | server/app.py |
| RETENTION_MINUTES | TTL minutes for retention sweeper. | server/app.py |
| RUNS_UPLOAD_DIR | Directory storing uploads for TTL deletion. | server/app.py |
| RUNS_TTL_DAYS | Days to retain uploads before cleanup. | server/app.py |
| SERVE_WEB | Serve built web dist via FastAPI if set to 1. | server/app.py |
| STAGING / APP_ENV | Marks staging mode for app state. | server/app.py |
| FLIGHT_RECORDER_PCT | Percentage of telemetry messages to record. | server/routes/ws_telemetry.py |
| FLIGHT_RECORDER_DIR | Directory for recorded telemetry JSON. | server/routes/ws_telemetry.py |
| GOLFIQ_RUNS_DIR | Root directory for run storage. | server/storage/runs.py |
| VITE_API_BASE | Web API base URL for axios/fetch. | web/src/api.ts |
| VITE_API_KEY | API key injected into web requests. | web/src/api.ts |
| VITE_VISUAL_TRACER_ENABLED | Flag for visual tracer features. | web/src/config.ts |
| VITE_PLAYS_LIKE_ENABLED | Toggle plays-like adjustments. | web/src/config.ts |
| VITE_QA_MODE | Enable QA replay routes. | web/src/config.ts / App.tsx |
| VITE_QUEUE_POLL_MS | Live queue polling interval. | web/src/config.ts |
| VITE_UPLOAD_RETRY_MAX_MS | Max retry window for uploads. | web/src/config.ts |
| VITE_UPLOAD_PRESIGN_VERSION | Presign version selection. | web/src/config.ts |
| VITE_TOP_SHOTS_ALPHA/BETA/GAMMA | SG weighting params. | web/src/config.ts |

## Mismatch Notes
- Existing `docs/ssot/backend-endpoints.md` aligns with current routes; newly observed device health (`/api/watch/devices/push_metrics`) and some event join variants are not explicitly listed there and have been captured above.
