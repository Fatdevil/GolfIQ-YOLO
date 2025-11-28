# Backend-endpoints

Tabellerna nedan listar centrala API:er baserat på routerdefinitionerna. Alla endpoints använder API-nyckel om inte annat anges.

## Hälsa och metrics
| Metod | Path | Beskrivning | Router/fil |
|-------|------|-------------|------------|
| GET | /health | Hälsokontroll med versionsfält. | `server/app.py` |
| GET | /metrics | Prometheus-export av requestmetrics. | `server/app.py` |

## CV & kalibrering
| Metod | Path | Beskrivning | Router/fil |
|-------|------|-------------|------------|
| POST | /cv/mock/analyze | Genererar syntetiska events/metrics och kan persistera run. | `server/routes/cv_mock.py` |
| POST | /cv/analyze | Analyserar ZIP-uppladdade frames (real pipeline). | `server/routes/cv_analyze.py` |
| POST | /cv/analyze/video | Analyserar video-upload och extraherar metrics. | `server/routes/cv_analyze_video.py` |
| POST | /range/practice/analyze | CV-analys för range practice (mock eller real backend). | `server/routes/range_practice.py` |
| POST | /calibrate/measure | Beräknar meters-per-pixel och kvalitetsindikatorer. | `server/routes/calibrate.py` |
| GET | /calibrate | API för kalibreringsresurser (legacy). | `server/api/routers/calibrate.py` |

## Runs & uploads
| Metod | Path | Beskrivning | Router/fil |
|-------|------|-------------|------------|
| GET | /runs | Lista senaste runs med sammanfattande metrics. | `server/routes/runs.py` |
| GET | /runs/{run_id} | Hämta run med params/metrics/events. | `server/routes/runs.py` |
| DELETE | /runs/{run_id} | Ta bort run och associerade filer. | `server/routes/runs.py` |
| POST | /runs/hud | Spara HUD-filer kopplade till run-upload. | `server/routes/runs_upload.py` |
| POST | /runs/round | Registrera run-identifierare för upload. | `server/routes/runs_upload.py` |
| GET | /runs/{run_id} (uploads) | Hämta uppladdningsmetadata för run. | `server/routes/runs_upload.py` |
| POST | /runs/upload-url | Skapa presigned PUT-url för ZIP-upload. | `server/routes/runs_upload.py` |
| POST | /runs/upload | Ladda upp ZIP direkt till serverns lagring. | `server/routes/runs_upload.py` |

## Course & bundles
| Metod | Path | Beskrivning | Router/fil |
|-------|------|-------------|------------|
| GET | /api/courses | Lista kursbundles (demo). | `server/api/routers/courses.py` |
| GET | /api/courses/hero | Lista kuraterade hero-banor med tee-data. | `server/api/routers/courses.py` |
| GET | /api/courses/{id}/bundle | Hämta kursbundle med hål/green-data. | `server/api/routers/courses.py` |
| GET | /courses | Lista kurser (legacy). | `server/routes/course_bundle.py` |
| GET | /course/{course_id} | Hämta kursdefinition. | `server/routes/course_bundle.py` |
| GET | /course/{course_id}/holes | Lista hål i kurs. | `server/routes/course_bundle.py` |
| GET | /course/{course_id}/holes/{hole_number} | Detaljdata för hål. | `server/routes/course_bundle.py` |
| POST | /bundle/course/{course_id} | Bygger och sparar bundlad kurs. | `server/routes/bundle.py` |
| GET | /bundle/index | Index över tillgängliga bundles. | `server/routes/bundle_index.py` |

## Events & live
| Metod | Path | Beskrivning | Router/fil |
|-------|------|-------------|------------|
| GET | /events/{event_id}/board | Hämtar leaderboard/boarddata. | `server/routes/events.py` |
| GET | /events/{event_id}/host | Host-state för live-event. | `server/routes/events.py` |
| POST | /events/{event_id}/start | Startar liveomgång. | `server/routes/events.py` |
| POST | /events/{event_id}/pause | Pausar liveomgång. | `server/routes/events.py` |
| POST | /events/{event_id}/close | Stänger event. | `server/routes/events.py` |
| POST | /events/{event_id}/code/regenerate | Skapar nytt join-kod. | `server/routes/events.py` |
| POST | /events/{event_id}/settings | Uppdaterar eventinställningar. | `server/routes/events.py` |
| POST | /live/heartbeat | Uppdaterar live-status och returnerar state. | `server/routes/live.py` |
| POST | /live/start | Initierar live-session. | `server/routes/live.py` |
| POST | /live/stop | Stoppar live-session. | `server/routes/live.py` |
| POST | /live/token | Skapar publik eller host token. | `server/routes/live.py` |
| GET | /live/status | Returnerar live-status. | `server/routes/live.py` |
| GET | /live/viewer_link | Returnerar signerad viewer-länk. | `server/routes/live.py` |
| POST | /live/exchange_invite | Byter invite-token mot viewer-länk. | `server/routes/live.py` |
| POST | /api/events/{event_id}/live/viewer-token | Skapar viewer-token (API-namnrymd). | `server/api/routers/live_tokens.py` |
| GET | /api/events/{event_id}/live/refresh | Förlänger viewer-token. | `server/api/routers/live_tokens.py` |

## Delning, åtkomst & scoring
| Metod | Path | Beskrivning | Router/fil |
|-------|------|-------------|------------|
| GET | /api/access/plan | Returnerar användarens plan (`free`/`pro`) samt ev. `trial` och `expires_at`. | `server/api/routers/access.py` |
| POST | /api/share/anchor | Skapar delningsankare. | `server/api/routers/share.py` |
| GET | /s/{sid} | Hämtar delningspayload/redirect. | `server/api/routers/share.py` |
| GET | /s/{sid}/o | Öppnar delning (redirect/översikt). | `server/api/routers/share.py` |
| GET | /api/share/{sid} | Returnerar delningspayload för tokeniserad länk. | `server/api/routers/share.py` |
| POST | /api/runs/{run_id}/score | Sparar scoring för run. | `server/api/routers/run_scores.py` |

## Caddie, SG & range
| Metod | Path | Beskrivning | Router/fil |
|-------|------|-------------|------------|
| POST | /api/caddie/advise | Returnerar klubbrekommendation. | `server/api/routers/caddie.py` |
| GET | /api/caddie/insights | Hämtar caddieinsikter (accept/ignore per klubb, recent vs lifetime trust). | `server/routes/caddie_insights.py` |
| POST | /api/caddie/telemetry | Uppladdning av telemetri för caddie. | `server/routes/caddie_telemetry.py` |
| GET | /api/coach/round-summary/{run_id} | Coach-sammanfattning: SG-preview, sekvens och caddie highlights för run (Pro). | `server/api/routers/coach.py` |
| POST | /api/coach/share/{run_id} | Skapar delningslänk för coach-rapport (Pro). | `server/api/routers/coach.py` |
| GET | /api/analytics/player | Pro-analytics: SG-trend, kategoristatus och missionsprogress per medlem. | `server/api/routers/analytics.py` |
| GET | /api/profile/player | AI-player profile v2: modell + 4-veckorsplan (Pro). | `server/api/routers/profile.py` |
| GET | /api/sg/run/{run_id} | Stroke-gain preview för run. | `server/routes/sg_preview.py` |
| GET | /api/sg/member/{member_id} | SG-sammanfattning per medlem. | `server/routes/sg_summary.py` |
| GET | /api/runs/{run_id}/sg | SG-data för run. | `server/api/routers/sg.py` |
| POST | /api/sg/runs/{run_id}/anchors | Skapar SG-ankare. | `server/api/routers/sg.py` |
| GET | /api/sg/runs/{run_id}/anchors | Listar SG-ankare. | `server/api/routers/sg.py` |

## Watch/HUD
| Metod | Path | Beskrivning | Router/fil |
|-------|------|-------------|------------|
| POST | /api/watch/hud/hole | Full HUD-snapshot för valt hål. | `server/api/routers/watch_hud.py` |
| POST | /api/watch/hud/tick | Lättviktsuppdatering (avstånd/tips). | `server/api/routers/watch_hud.py` |
| POST | /api/watch/pair/code | Skapar join-kod för pairing. | `server/api/routers/watch_pairing.py` |
| POST | /api/watch/devices/register | Registrerar watch-enhet. | `server/api/routers/watch_pairing.py` |
| POST | /api/watch/devices/bind | Binder enhet till medlem via kod. | `server/api/routers/watch_pairing.py` |
| POST | /api/watch/devices/token | Förnyar enhetstoken. | `server/api/routers/watch_pairing.py` |
| GET | /api/watch/devices/stream | SSE-stream av tips/notiser. | `server/api/routers/watch_pairing.py` |
| POST | /api/watch/devices/ack | ACK av mottagna tips/notiser. | `server/api/routers/watch_pairing.py` |
| POST | /api/watch/quickround/sync | Pushar Quick Round HUD till primärenhet. | `server/api/routers/watch_quickround.py` |
| POST | /api/watch/{member_id}/tips | Posta en tip till medlem. | `server/api/routers/watch_tips.py` |
| GET | /api/watch/{member_id}/tips/stream | SSE-stream för tips. | `server/api/routers/watch_tips.py` |

## Telemetry & providers
| Metod | Path | Beskrivning | Router/fil |
|-------|------|-------------|------------|
| POST | /telemetry | Enkelt telemetriuppladdning (JSON). | `server/routes/ws_telemetry.py` |
| POST | /telemetry/batch | Batchuppladdning av telemetri. | `server/routes/ws_telemetry.py` |
| GET | /providers/elevation | Hämtar höjddata för koordinat. | `server/routes/providers.py` |
| GET | /providers/wind | Hämtar vinddata för koordinat. | `server/routes/providers.py` |
