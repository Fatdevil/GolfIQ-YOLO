# GolfIQ-YOLO Single Source of Truth (v2)

## Executive Summary
GolfIQ-YOLO är en plattform för golfanalys med FastAPI-backend, React-Single Page App och watch/HUD-flöden. FastAPI-applikationen monterar både legacy-rutter och API-namnrymder med API-nyckelkontroll och hanterar allt från CV-analys till liveevents, strokes gained, trip-scoreboards och watch-pairing i `server/app.py`. Webben är en Vite/React-app med routerdefinitioner i `web/src/App.tsx` som täcker analys, event/live-vyer, range practice, Quick Round och trip-scoreboards. Watch/HUD-snapshots byggs via `build_hole_hud` och servas av watch-routerparet i `server/watch/hud_service.py` och `server/api/routers/watch_hud.py`.

## Arkitekturöversikt
```
[Web SPA / iOS/Android/Watch-klienter]
          |
          v
 [FastAPI (server/app.py)] -- Metrics --> [/metrics]
          |
          +--> CV och range (/cv/*, /range/practice)
          +--> Runs/SG/Coach/Caddie (/runs, /api/sg, /api/coach)
          +--> Events/Live/Feed (/events, /live, /feed/home)
          +--> Watch/HUD/Pairing (/api/watch/*)
          +--> Trip & history (/api/trip/*, /public/trip/*, /api/user/history/*)
          v
   [Filbaserad lagring data/runs, uploads + in-memory stores]
```
- Backend: `server/app.py` registrerar CORS, MetricsMiddleware och samtliga routers inklusive coach, caddie, courses, watch, trip och live.【F:server/app.py†L13-L200】
- Webb: `web/src/App.tsx` definierar alla routes för analyser, events, range, bag/profile, Quick Round och trip-delning.【F:web/src/App.tsx†L1-L103】
- Watch/HUD: HUD byggs och auto-detekterar hål i `server/watch/hud_service.py` och exponeras via `/api/watch/hud/*` i `server/api/routers/watch_hud.py`.【F:server/watch/hud_service.py†L1-L172】【F:server/api/routers/watch_hud.py†L1-L96】

## Backend & API
- Framework: FastAPI med API-nyckel via `require_api_key`; routers inkluderas centralt i `server/app.py`. Metrics exporteras via `/metrics`.【F:server/app.py†L35-L200】
- CV & kalibrering: Mock- och realanalys (`/cv/mock/analyze`, `/cv/analyze`, `/cv/analyze/video`) plus range practice-analys `/range/practice/analyze` och kalibrering `/calibrate/measure`.【F:server/routes/cv_mock.py†L18-L76】【F:server/routes/cv_analyze.py†L18-L77】【F:server/routes/cv_analyze_video.py†L13-L71】【F:server/routes/range_practice.py†L11-L22】【F:server/routes/calibrate.py†L7-L31】
- Runs & uploads: CRUD på runs (`/runs`), filuppladdning/presign (`/runs/upload-url`, `/runs/upload`), samt delade HUD/round-run payloads via `/runs/hud` och `/runs/round`.【F:server/routes/runs.py†L1-L57】【F:server/routes/runs_upload.py†L98-L183】
- Courses & auto-hole: Hero- och legacybundles via `/api/courses` + `/courses` och auto-hål-detektion via `/api/auto-hole`. Bundle-index och builder finns under `/bundle/*`.【F:server/api/routers/courses.py†L1-L35】【F:server/routes/course_bundle.py†L5-L56】【F:server/api/routers/hole_detect.py†L4-L38】【F:server/routes/bundle_index.py†L3-L21】
- Caddie, SG & anchors: Klubbråd via `/api/caddie/advise`, SG-v2 via `/api/sg/runs/{run_id}`, SG-ankare via `/api/sg/runs/{run_id}/anchors` och run-score events via `/api/runs/{run_id}/score`. Separata anchor-endpoints `/api/runs/{run_id}/anchors` för clip-ankare. Coach-flöden täcker `/coach`, `/coach/feedback` och `/api/coach/diagnosis|round-summary`.【F:server/api/routers/caddie.py†L1-L16】【F:server/api/routers/sg.py†L1-L64】【F:server/api/routers/run_scores.py†L1-L36】【F:server/api/routers/anchors.py†L1-L45】【F:server/api/routers/coach.py†L1-L33】【F:server/api/routers/coach_feedback.py†L1-L52】
- Watch/HUD & pairing: Full HUD och tick via `/api/watch/hud/hole|tick`, pairing + tokens + SSE via `/api/watch/pair/code`, `/api/watch/devices/*`, Quick Round-sync `/api/watch/quickround/sync` och tip-stream `/api/watch/{member_id}/tips`.【F:server/api/routers/watch_hud.py†L12-L119】【F:server/api/routers/watch_pairing.py†L81-L200】【F:server/api/routers/watch_quickround.py†L14-L62】【F:server/api/routers/watch_tips.py†L34-L68】
- Events, live & feed: Eventleaderboard/host-rutter under `/events/{id}/*`, live-state och tokens under `/live/*` och `/api/events/{event_id}/live/*`, samt startsidesfeed `/feed/home`. Clip- och moderationflöden finns i `server/routes/clips.py` och `server/routes/moderation.py`.【F:server/routes/events.py†L1207-L1512】【F:server/routes/live.py†L99-L185】【F:server/api/routers/live_tokens.py†L1-L47】【F:server/routes/feed.py†L205-L243】【F:server/routes/clips.py†L8-L68】
- Trip & historik: Trip-scoreboards via `/api/trip/rounds/*` och publik ström `/public/trip/rounds/*`. Användarhistorik för quickrounds och rangesessions lagras via `/api/user/history/*`.【F:server/api/routers/trip.py†L1-L108】【F:server/api/routers/trip_public.py†L1-L46】【F:server/api/routers/user_history.py†L1-L39】
- Access & delning: Planstatus `/api/access/plan`, kortlänkar för shot-ankare via `/api/share/anchor` och OG/redirect på `/s/{sid}`. Featureflaggor för remote config exponeras via `server/config/remote.py` (ingår i app-routern).【F:server/api/routers/access.py†L12-L23】【F:server/api/routers/share.py†L12-L63】【F:server/app.py†L53-L114】

## Web / Admin-frontend
- Routing: `web/src/App.tsx` sätter rutter för analyser (/analyze, /mock, /calibration), run-historik (/runs/:id, /share/:id), event/live (/events/:id/live, host/viewer/admin/top-shots), range practice (/range/practice, /range/score), bag/profile/settings, Quick Round (/play, /play/:roundId), trip-scoreboards (/trip/*) och dev-verktyg (HUD- och caddie-insikter).【F:web/src/App.tsx†L10-L103】
- Sessionhantering: Livevyer omsluts av `EventSessionBoundary`; PlayerOverlay och CDN-preconnect laddas globalt för mediahantering i App. Featuregates/access läses via access-provider (API-nyckel/plan).【F:web/src/App.tsx†L26-L103】
- Dataflöde: API-bas och nyckel kommer från Vite-env (`VITE_API_BASE`, `VITE_API_KEY`); Quick Round-starten hämtar course/hero-listor och skapar lokala ronder innan play-rutten navigeras.【F:web/src/pages/quick/QuickRoundStartPage.tsx†L86-L156】

## Watch- & mobilbrygga / HUD
- HUD-skapande: `build_hole_hud` kombinerar run-kontekst (event, SG, skottantal), course bundle (hero + legacy), GNSS och miljödata för plays-like och avstånd. Planen (`free`/`pro`) hämtas från API-nyckel/konfig och styr caddie/tipfält. Auto-detektion av hål använder hero- eller legacybundles med minsta konfidens för override.【F:server/watch/hud_service.py†L1-L172】【F:server/watch/hud_service.py†L180-L217】
- HUD-endpoints: `/api/watch/hud/hole` ger full snapshot inkl. green/front/back och tips, medan `/api/watch/hud/tick` ger lätta uppdateringar och återanvänder auto-detect + bundleavstånd när GNSS skickas.【F:server/api/routers/watch_hud.py†L12-L119】
- Pairing & tips: Pairingflödet skapar join-kod, registrerar enheter, binder med kod och förnyar tokens; SSE-strömmen skickar tips/notiser och ackas av klienten. Quick Round-sync pushar HUD-data till utpekad enhet. Tips kan även postas/strömmas per medlem via `/api/watch/{member_id}/tips`.【F:server/api/routers/watch_pairing.py†L81-L200】【F:server/api/routers/watch_quickround.py†L14-L62】【F:server/api/routers/watch_tips.py†L34-L68】

## Data, lagring & modeller
- Runs: Filbaserad lagring i `data/runs` med `RunRecord` (run_id, tidsstämpel, källa, mode, params, metrics, events, optional impact_preview). Skrivs/lad delas via `server/storage/runs.py`.【F:server/storage/runs.py†L16-L121】
- Uploads & delade payloads: `/runs/upload` sparar ZIP till `RUNS_UPLOAD_DIR`; delade HUD- och round-run payloads skrivs som JSON med idempotenta nycklar i `server/routes/runs_upload.py`.【F:server/routes/runs_upload.py†L20-L115】【F:server/routes/runs_upload.py†L183-L243】
- Anchors: In-memory store för shot-ankare (`runId`, `hole`, `shot`, `clipId`, tidsintervall) i `server/services/anchors_store.py`, med versionsstöd för patch. Shot-ankare används av share/SG-flöden.【F:server/services/anchors_store.py†L1-L69】
- Coursebundles: Hero-katalog laddas från `server/bundles/hero_catalog.py` (JSON + hero_courses/) och legacybundles hämtas via `server/courses/store`. Auto-hole använder bundle-geometrier och GNSS-konfidens.【F:server/bundles/hero_catalog.py†L1-L70】【F:server/courses/hole_detect.py†L1-L74】
- Trip & historik: Trip-rundor och publika tokens lagras i in-memory store (`server/trip/store.py` via routers). Användarhistorik för quickrounds/range hålls i `_STORE` i `server/user/history_service.py`.【F:server/api/routers/trip.py†L1-L108】【F:server/api/routers/trip_public.py†L1-L46】【F:server/user/history_service.py†L1-L35】

## Telemetry, logging & metrics
- MetricsMiddleware loggar request-latens och exponerar Prometheus `/metrics` via `server/metrics.metrics_app`. Health-check `/health` returnerar build/git metadata. Telemetriuppladdning och batch finns i `/telemetry` och `/telemetry/batch`.【F:server/app.py†L35-L200】【F:server/routes/ws_telemetry.py†L121-L136】
- Feed/live telemetri: Feed/home-requests emitteras via `telemetry_service.emit_feed_*`; live-state signerade länkar loggas via live_signing. Coach/caddie/SG emissioner använder `server/services/telemetry.emit`.【F:server/routes/feed.py†L205-L243】【F:server/api/routers/live_tokens.py†L14-L44】【F:server/api/routers/sg.py†L39-L63】

## CI/CD & test/coverage
- Huvud-CI `ci.yml` kör black, flake8, pytest med coverage-gate och uppdaterar badge/baseline på main. CV-engine har egen coverage-workflow `cv-engine-coverage.yml`. Webbygg/test körs i `web.yml`.【F:.github/workflows/ci.yml†L1-L63】【F:.github/workflows/cv-engine-coverage.yml†L1-L28】【F:.github/workflows/web.yml†L1-L28】
- Mobilflöden: Android/iOS byggs och testas via `android-ci.yml`, `android-release.yml`, `ios-ci.yml`, `ios-build.yml`, samt beta/releasepipelines. Specialflöden finns för golden regression, bundle-validate, accuracy gate och auto-merge-green.【F:.github/workflows/android-ci.yml†L1-L36】【F:.github/workflows/ios-ci.yml†L1-L36】【F:.github/workflows/golden-regression.yml†L1-L38】【F:.github/workflows/accuracy-gate.yml†L1-L44】

## Konfiguration & secrets (översikt)
- API-nyckel: `API_KEY` krävs för de flesta endpoints via `require_api_key`. CORS styrs av `CORS_ALLOW_ORIGINS`. Retention/cykler styrs av `RETENTION_DIRS`, `RETENTION_MINUTES`, `RUNS_UPLOAD_DIR`, `RUNS_TTL_DAYS`. Live-signeringsnyckel/tidsgräns sätts via `LIVE_SIGN_SECRET` och `LIVE_SIGN_TTL_SEC`.【F:server/app.py†L35-L121】【F:server/api/routers/live_tokens.py†L14-L34】
- CV-val och lagring: `STORAGE_BACKEND` avgör S3 vs filsystem för uploads; `RANGE_PRACTICE_CV_BACKEND` och `YOLO_*` styr CV-läge. Hero/legacy course roots hämtas från bundles-katalogerna. Inga hemliga nycklar checkas in (device tokens genereras vid pairing).【F:server/routes/runs_upload.py†L183-L243】【F:server/routes/range_practice.py†L11-L22】【F:server/api/routers/watch_pairing.py†L81-L158】

## Risker, teknisk skuld & förbättringar
- In-memory stores (anchors, trip, user history, watch pairing, SG cache) saknar persistens och delas inte mellan instanser → risk för dataförlust och inkonsistens vid skalning.【F:server/services/anchors_store.py†L1-L69】【F:server/api/routers/trip.py†L1-L108】【F:server/api/routers/watch_pairing.py†L81-L158】
- Blandning av legacy-/api-prefix (/runs vs /api/runs, /courses vs /api/courses) gör klientkonfiguration och auth-krav svåröverskådliga; behöver konsolideras och dokumenteras i OpenAPI. 【F:server/app.py†L53-L186】
- Filbaserad run- och uploadlagring saknar låsning/GC utöver periodisk sweep; risk för disktryck vid felaktiga TTL-inställningar. 【F:server/storage/runs.py†L16-L121】【F:server/routes/runs_upload.py†L183-L243】
- Event/live och feed använder cache/in-memory-etags utan persistens; vid flernoddrift krävs delad cache för konsistens. 【F:server/routes/feed.py†L205-L243】【F:server/routes/live.py†L99-L185】

## Rekommenderade nästa steg
1. Konsolidera API-prefix och auth-regler (t.ex. `/api/*`) och generera OpenAPI-spec för web/watch-klienter.
2. Lägg till persistenta stores för anchors, trip och user history (t.ex. Redis/DB) och dela rate limits/pairing-state över instanser.
3. Byt filbaserad run/upload-hantering mot S3/objektlager med checksum-låsning och schemalagd GC.
4. Dokumentera och testa hero vs legacy course-flöden (auto-hole + HUD) samt fallback-logik för GNSS saknas.
5. Bygg övervakning på feed/live/coach/SG-latenser i Metrics/Prometheus och koppla dashboards.
