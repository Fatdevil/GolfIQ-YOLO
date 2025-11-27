# Produktkapabiliteter

## Översikt
GolfIQ-YOLO levererar CV-baserad golfanalys, liveevent och watch/HUD-stöd via FastAPI-backend och en React-baserad webapp. Funktionerna nedan beskriver vad användaren kan göra idag, med referenser till underliggande moduler.

## Free vs Pro
- **Free**: Fokus på range-upplevelsen med Target Bingo, missions och möjlighet att dela resor; grundläggande HUD/scoreboard och bag-hantering ingår.
- **Pro**: Låser upp SG-preview och SG-sammanfattningar, caddie-insikter/coach-kort, GhostMatch och HUD-preview/hero-kursdata. Planstatus hämtas från `/api/access/plan` och injiceras via web-accessprovidern.
- **Coach v2** (Pro): Personliga SG-drivna handlingsplaner (range + on-course missions) visas på Quick Round-sammanfattning och My GolfIQ.

## On-course
- **Live events och leaderboards**: Användare kan skapa och följa liveevents, inklusive host-läge, viewer-läge och top-shots. Webbrutter `/events/:id/live`, `/events/:id/live-host` och `/events/:id/live-view` stöds av live-endpoints i `server/routes/live.py` och event-board i `server/routes/events.py`.【F:web/src/App.tsx†L64-L118】【F:server/app.py†L182-L186】
- **Snabbrunda (Quick Round) med watch-synk**: Webben erbjuder `/play` och `/play/:roundId` för snabbrunda, medan `/api/watch/quickround/sync` skickar HUD-data till primärenhet efter hålvalidering.【F:web/src/App.tsx†L135-L139】【F:server/api/routers/watch_quickround.py†L14-L62】
- **Hero-banor för snabbrunda**: `/play` visar kuraterade hero-banor med tee-längder från `/api/courses/hero`, så spelare snabbt kan välja färdiga banpaket med HUD-geometri.【F:web/src/pages/quick/QuickRoundStartPage.tsx†L96-L181】【F:server/api/routers/courses.py†L7-L34】
- **Fördefinierade hero-kataloger**: Backend läser hero-katalogen och bundle-filer för att hålla ihop namn, plats och HUD-redo geometri utan att ändra befintliga bundle-endpoints.【F:server/bundles/hero_catalog.py†L1-L112】【F:server/bundles/hero_courses/demo_links_hero.json†L1-L41】
- **HUD i handleden**: Watch-klienter kan hämta fullständiga HUD-snapshots och tick-uppdateringar med plays-like, tips och green-avstånd via `/api/watch/hud/hole` och `/api/watch/hud/tick`, genererade av `build_hole_hud`.【F:server/api/routers/watch_hud.py†L12-L119】【F:server/watch/hud_service.py†L1-L112】

## Range/practice
- **CV-analys av range-kapture**: Webbrutten `/range/practice` skickar payload till `/range/practice/analyze`, som kör vald CV-backend och returnerar normaliserade metrics och kvalitetsdata.【F:web/src/App.tsx†L127-L128】【F:server/routes/range_practice.py†L11-L22】
- **Gapping och bag-hantering**: `/bag`-sidan låter spelare konfigurera klubbars carry, vilket används av caddie/HUD för plays-like-beräkningar (defaultbag i `hud_service`).【F:web/src/App.tsx†L129-L133】【F:server/watch/hud_service.py†L37-L80】

## Admin/coach
- **Eventmoderation och clip-kö**: Admin-rutter `/events/:id/admin/clips` och `/events/:id/admin/moderation` ger kö- och modereringsvyer för inspelade klipp från event.【F:web/src/App.tsx†L96-L110】
- **Feedback- och device dashboards**: `/admin/feedback` visar inkommande feedback, medan `/device-dashboard` exponerar enhetsstatus för fälttester.【F:web/src/App.tsx†L123-L125】
- **Caddie-insikter och SG**: Utvecklarvy `/dev/caddie-insights` presenterar caddieinsikter; backend tillhandahåller SG-data via `/api/sg/*` och previews via `/api/sg/run/{run_id}`/`/api/sg/member/{member_id}`.【F:web/src/App.tsx†L133-L134】【F:server/api/routers/sg.py†L92-L109】【F:server/routes/sg_preview.py†L15-L15】【F:server/routes/sg_summary.py†L18-L18】

## Delning och historik
- **Run-historik och delning**: `/runs` och `/runs/:id` visar sparade runs; backend lagrar och returnerar run-metrics via `/runs`-API och lagringsmodulen `server/storage/runs.py`. Delning sker via `/share/:id` och API:et `/api/share/anchor` + `/s/{sid}` för publika länkar.【F:web/src/App.tsx†L55-L61】【F:server/routes/runs.py†L10-L60】【F:server/storage/runs.py†L16-L121】【F:server/api/routers/share.py†L40-L81】
- **Trip-scoreboards**: `/trip/start`, `/trip/:tripId` och publika `/trip/share/:token` visar trip-baserad scoring; backend-streamar via `server/api/routers/trip.py` och `trip_public.py`.【F:web/src/App.tsx†L137-L139】【F:server/api/routers/trip.py†L48-L141】【F:server/api/routers/trip_public.py†L30-L58】
