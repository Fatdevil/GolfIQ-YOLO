# GolfIQ-YOLO Single Source of Truth (v2)

## Executive Summary
GolfIQ-YOLO är ett plattformspaket för golfanalys med FastAPI-backend, React-webbapp och watch/HUD-integration. Backend samlar CV-analys (mock och video), evenemangsliveströmmar, range practice, caddie-råd och stroke-gainsberäkningar. Webben är en Vite/React-Single Page App med rutter för analyser, range, liveevents, snabbrundor och delning. Watch-flöden erbjuder HUD-snapshots, pairing och Quick Round-synk över dedikerade API:er.

## Arkitekturöversikt
```
[Web/Watch/iOS/Android] -> [FastAPI server/app.py] -> [Lagrat på disk (data/runs, uploads)]
                                        \-> [CV-engine helpers]
                                        \-> [Services: caddie, courses, telemetry]
```
- Backend: `server/app.py` monterar alla routers och middleware (CORS, Metrics).【F:server/app.py†L13-L194】
- Webb: `web/src/App.tsx` definierar SPA-rutterna och komponenterna.【F:web/src/App.tsx†L1-L141】
- Watch/HUD: API-ändpunkter och payloadbyggen i `server/api/routers/watch_hud.py` och `server/watch/hud_service.py`.【F:server/api/routers/watch_hud.py†L1-L99】【F:server/watch/hud_service.py†L1-L80】

## Backend & API
- Framework: FastAPI med routers under `server/routes` (legacy) och `server/api/routers` (API-namnrymd). Inkludering sker i `server/app.py` med API-nyckelkontroll via header `x-api-key` när `API_KEY` sätts i miljövariabel.【F:server/app.py†L13-L194】
- Huvuddomäner:
  - CV-analys: `/cv/mock/analyze` för syntetiska frames och lagring av runs.【F:server/routes/cv_mock.py†L18-L76】 `/analyze`-serien hanterar frames, video och range practice.
  - Runs: lista, hämta och ta bort runs via `/runs`-prefixet med filbaserad lagring i `server/storage/runs.py`.【F:server/routes/runs.py†L10-L60】【F:server/storage/runs.py†L16-L121】
  - Evenemang & live: `server/routes/events.py` täcker scoreboard, host/participant flöden; `server/routes/live.py` hanterar live-state och tokens.【F:server/app.py†L182-L186】
  - Caddie & SG: rådgivning och insikter via `/api/caddie/*`, stroke-gain endpoints under `server/api/routers/sg.py`.【F:server/app.py†L20-L27】【F:server/api/routers/sg.py†L92-L109】
  - Kursdata: statiska/demobundles via `/api/courses` och `/course/{id}`-rutter.【F:server/app.py†L21-L24】【F:server/routes/course_bundle.py†L51-L99】
  - Delning & åtkomst: `/api/access/plan` för planinfo och `/s/{sid}`-delning av innehåll.【F:server/api/routers/access.py†L18-L18】【F:server/api/routers/share.py†L40-L81】
  - Telemetri/logg: websocket och batchuppladdningar via `server/routes/ws_telemetry.py`.【F:server/routes/ws_telemetry.py†L121-L136】
- Autentisering: API-nyckel via `require_api_key`/`_api_key_dependency` för de flesta routers; watch-enheter har separata tokens i pairingflödet.【F:server/app.py†L76-L174】【F:server/api/routers/watch_pairing.py†L86-L168】

## Web / Admin-frontend
- Routing: React Router i `web/src/App.tsx` med rutter för analys (`/analyze`, `/mock`, `/calibration`), runhistorik (`/runs/:id`), events (live/host/admin/top-shots), range practice (`/range/practice`), bag och profil, Quick Round (`/play`), samt trip-scoreboards.【F:web/src/App.tsx†L52-L140】
- API-anrop: Webben använder `VITE_API_BASE` och `VITE_API_KEY` för backend, med endpoints dokumenterade i README och motsvarande `server/routes`/`server/api/routers`.
- UI-stöd: Player overlay, event session boundary och CDN-preconnect för media laddas globalt i App-komponenten.【F:web/src/App.tsx†L34-L144】

## Watch- & mobilbrygga / HUD
- HUD byggs via `build_hole_hud` i `server/watch/hud_service.py`, som slår upp course bundles, caddie-råd och telemetri för att producera HoleHud/Tick-respons.【F:server/watch/hud_service.py†L1-L112】【F:server/watch/hud_service.py†L180-L217】
- HUD-endpoints: `/api/watch/hud/hole` returnerar full snapshot inkl. avstånd och tips; `/api/watch/hud/tick` ger lätta delta-uppdateringar med spelarens nuvarande hål och plays-like-meter.【F:server/api/routers/watch_hud.py†L12-L71】【F:server/api/routers/watch_hud.py†L95-L119】
- Pairing och enhetsflöden: join-kod generering, device registration/binding, token-refresh, SSE-stream och ACK via `server/api/routers/watch_pairing.py` (`/api/watch/pair/code`, `/api/watch/devices/*`).【F:server/api/routers/watch_pairing.py†L81-L200】
- Quick Round-synk: `/api/watch/quickround/sync` pushar HUD-data till primär enhet efter hålvalidering.【F:server/api/routers/watch_quickround.py†L14-L62】

## Data, lagring & modeller
- Runs lagras filbaserat under `data/runs` med struktur `run.json` och valfri `impact_preview.zip`. Dataklassen `RunRecord` innehåller run-id, tidsstämpel, källa, mode, params, metrics och eventlistor.【F:server/storage/runs.py†L16-L121】
- Coursebundles: både legacy (`server/courses`) och “hero” bundles (`server/bundles`) används för hål- och green-geometri, inkl. avståndsberäkning för HUD.【F:server/watch/hud_service.py†L11-L37】
- Hero-katalog: `server/bundles/hero_catalog.json` kopplar id till hero-banor och matas ut via `/api/courses/hero` för Quick Round och HUD.【F:server/bundles/hero_catalog.json†L1-L16】【F:server/api/routers/courses.py†L7-L34】
- Watch-tippar och caddie-råd hämtas via services (`server/services/watch_tip_bus`, `server/caddie/advise`) och serialiseras in i HUD-scheman (`server/watch/hud_schemas.py`).【F:server/watch/hud_service.py†L11-L59】

## Telemetry, logging & metrics
- MetricsMiddleware loggar requests och exponerar Prometheus `/metrics` via `server/metrics.metrics_app` monterad i `server/app.py`.【F:server/app.py†L35-L200】
- Telemetri-uppladdning och WebSocket-telemetry stöds via `server/routes/ws_telemetry.py` (enkla POST och batch-ingest).【F:server/routes/ws_telemetry.py†L121-L136】
- Live viewer tokens och events emit använder `server/routes/live.py` och `server/api/routers/live_tokens.py` för säkrade länkar och heartbeat.【F:server/app.py†L185-L186】【F:server/api/routers/live_tokens.py†L30-L54】

## CI/CD & test/coverage
- Centrala workflowen `ci.yml` kör black/flake8 samt pytest med coverage för `server/tests` och uppdaterar badge/baseline på main. Coverage gate på PR körs via `.github/scripts/coverage_gate.py`.【F:.github/workflows/ci.yml†L1-L65】
- Ytterligare workflows hanterar Android/iOS builds, golden regression, web-build, static analysis och release-taggar (`.github/workflows/*.yml`).【F:.github/workflows/ci.yml†L1-L65】

## Konfiguration & secrets (översikt)
- Miljövariabler styr API-nyckel (`API_KEY`), CORS (`CORS_ALLOW_ORIGINS`), retention (dirs, TTL), live tokens (`LIVE_SIGN_SECRET`), CV-mode (`YOLO_*`, `RANGE_PRACTICE_CV_BACKEND`) och filkataloger (`RUNS_UPLOAD_DIR`, `RUNS_TTL_DAYS`).【F:server/app.py†L76-L200】【F:README.md†L1-L80】
- Watch pairing använder signerade device tokens genererade från device secrets; inga hemligheter checkas in i repo.【F:server/api/routers/watch_pairing.py†L120-L170】

## Risker, teknisk skuld & förbättringar
- Stor router-yta med blandning av legacy (`/routes`) och nya (`/api/routers`) kan leda till duplicerade endpoints och korsande auth-mönster; föreslår konsolidering och dokumentation av prefix.
- Filbaserad run-lagring saknar explicit låsning/GC utöver periodisk retention-task; risk för diskväxt om RUNS_TTL_DAYS inte sätts korrekt.【F:server/app.py†L90-L121】【F:server/storage/runs.py†L16-L121】
- Watch pairing har in-memory rate limits utan persistens; kan inte delas mellan instanser. Behöver centraliserad rate limiting/backing store för produktion.【F:server/api/routers/watch_pairing.py†L33-L75】

## Rekommenderade nästa steg
1. Konsolidera API-prefix och OpenAPI-dokumentation så web/watch-klienter får enhetlig bas-URL och auth-krav.
2. Lägg till enhetstester/contract-tester för watch HUD-builders och pairing-flöden, särskilt auto-detect av hål och tip-streams.
3. Inför konfigurerbar persistent lagring (t.ex. S3 eller DB) för runs och uploads istället för lokala `data/`-kataloger.
4. Dokumentera och kapsla CV-backendval (mock vs real) i en service så Range Practice kan växla utan kodändringar.
5. Bygg dashboards för Metrics/Prometheus-exporter för att följa request-latens, live heartbeat och watch SSE-öppningar.
