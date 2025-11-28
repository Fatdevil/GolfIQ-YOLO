# Produktkapabiliteter

## Översikt
GolfIQ-YOLO levererar golfanalys, liveevent och HUD-upplevelser genom FastAPI-backend och en React-baserad webapp. Funktionerna nedan beskriver vad användaren kan göra idag, med referenser till underliggande moduler.

## Free vs Pro
- **Planupplåsning**: `/api/access/plan` skiljer på `free` och `pro`; Pro-nycklar låser upp plays-like, tips och coach/SG-flöden medan Free får basavstånd och plan-gated fält i HUD. 【F:server/api/routers/access.py†L12-L23】【F:server/watch/hud_service.py†L130-L172】
- **Pro-specifika svar**: Coach-API:er (`/api/coach/round-summary`, `/api/coach/diagnosis`) och caddie/plays-like i HUD kräver Pro-plan; Free returnerar `caddie_silent_reason="plan_gated"`. 【F:server/api/routers/coach.py†L17-L33】【F:server/watch/hud_service.py†L130-L172】

## On-course
- **Live events och leaderboards**: Skapa och driva liveevents med host-/viewer-lägen, leaderboards och top-shots via webbrutter `/events/:id/live*` och backend-endpoints `/events/{id}/*` samt `/live/*`. 【F:web/src/App.tsx†L61-L118】【F:server/routes/events.py†L1207-L1512】【F:server/routes/live.py†L99-L185】
- **Watch HUD**: Klockan hämtar fullständiga HUD-snapshots och tick-uppdateringar med auto-hole, greenavstånd, plays-like och tips via `/api/watch/hud/hole` och `/api/watch/hud/tick`, genererade av `build_hole_hud`. 【F:server/api/routers/watch_hud.py†L12-L119】【F:server/watch/hud_service.py†L1-L172】
- **Pairing & tips**: Användaren kan para ihop klockan via join-kod, hantera device tokens och ta emot tips över SSE-strömmen (`/api/watch/devices/stream`, `/api/watch/{member_id}/tips/stream`). 【F:server/api/routers/watch_pairing.py†L81-L200】【F:server/api/routers/watch_tips.py†L34-L68】
- **Quick Round**: Webben startar snabbrundor på `/play` och spelar på `/play/:roundId`; backend kan synka HUD-data till primärenhet via `/api/watch/quickround/sync`. Round-starten stödjer både legacy course-listor och hero-katalog med tee/hål-metadata. 【F:web/src/App.tsx†L135-L139】【F:web/src/pages/quick/QuickRoundStartPage.tsx†L90-L195】【F:server/api/routers/watch_quickround.py†L14-L62】
- **Trip-scoreboards**: Användare kan skapa privata resor med spelare/tees och dela publikt via token; live-SSE finns för både privat och publik vy. Webben har `/trip/start` och delningsvyer. 【F:web/src/App.tsx†L137-L139】【F:server/api/routers/trip.py†L1-L108】【F:server/api/routers/trip_public.py†L1-L46】

## Range/practice
- **CV-analys för range**: `/range/practice` skickar inspelningar till `/range/practice/analyze` för normaliserade metrics och spel-lägen; resultat visas även på `/range/score`. 【F:web/src/App.tsx†L127-L128】【F:server/routes/range_practice.py†L11-L22】
- **Gapping och bag**: `/bag` låter användaren sätta carries; HUD/caddie använder defaultbag om data saknas. 【F:web/src/App.tsx†L129-L133】【F:server/watch/hud_service.py†L1-L40】
- **Calibration**: `/calibration` guidar användaren att räkna meters-per-pixel via `/calibrate/measure`. 【F:web/src/App.tsx†L55-L58】【F:server/routes/calibrate.py†L7-L31】

## Admin/coach
- **Eventmoderation och clip-kö**: Admin-vyer `/events/:id/admin/clips` och `/events/:id/admin/moderation` hanterar inspelade klipp; backend-rutterna finns i `server/routes/clips.py` och moderation-router. 【F:web/src/App.tsx†L96-L110】【F:server/routes/clips.py†L8-L68】【F:server/routes/moderation.py†L7-L63】
- **Coach-feedback och diagnos**: Coach-LLM (`/coach`), coach-feedback (rate-limited) och diagnostik/round-summary (Pro) finns tillgängliga via API:erna och ger textrespons baserat på metrics eller run-data. 【F:server/api/routers/coach.py†L1-L33】【F:server/api/routers/coach_feedback.py†L27-L67】
- **Caddie-insikter och SG**: Dev-vyn `/dev/caddie-insights` visar trender; SG-data levereras via `/api/sg/runs/{run_id}` och används i scoring/HUD. 【F:web/src/App.tsx†L133-L134】【F:server/api/routers/sg.py†L39-L63】

## Delning och historik
- **Run-historik och delning**: `/runs` och `/runs/:id` visar sparade runs; delning sker via `/share/:id` och API:et `/api/share/anchor` + `/s/{sid}` för publika länkar. Run-data lagras filbaserat i `server/storage/runs.py`. 【F:web/src/App.tsx†L57-L63】【F:server/routes/runs.py†L1-L57】【F:server/api/routers/share.py†L12-L63】【F:server/storage/runs.py†L16-L121】
- **Shortlinks för SG-klipp**: Anchors kan skapas via `/api/runs/{run_id}/anchors` och delas som kortlänkar med OG-stöd via `/api/share/anchor` och `/s/{sid}/o`. 【F:server/api/routers/anchors.py†L12-L45】【F:server/api/routers/share.py†L12-L63】
- **Användarhistorik**: Quickrounds och range-sessioner kan sparas/hämtas via `/api/user/history/*`, vilket ger klienterna enkel historik utan persistent backend. 【F:server/api/routers/user_history.py†L1-L39】【F:server/user/history_service.py†L1-L25】
- **Trip-delning**: Publika tokens för trip-scoreboards skapas via `/api/trip/rounds/{trip_id}/share` och öppnas under `/public/trip/rounds/{token}` med SSE-ström. 【F:server/api/routers/trip.py†L91-L108】【F:server/api/routers/trip_public.py†L1-L46】
