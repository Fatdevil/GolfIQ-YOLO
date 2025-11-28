# Web-arkitektur

## Routing & vyer
React-router konfigureras i `web/src/App.tsx` och omfattar följande nyckelvyer:

| URL-path | Komponent | Syfte |
|----------|-----------|-------|
| `/` | `HomeHubPage` | Samlad hubb/översikt. |
| `/feed` | `HomeFeed` | Flöde av live/top-shots. |
| `/analyze` | `AnalyzePage` | Kör CV-analys mot `/cv/analyze`. |
| `/mock` | `MockAnalyzePage` | Testa mock-analys mot `/cv/mock/analyze`. |
| `/calibration` | `CalibrationPage` | Kalibreringsguide som kallar `/calibrate/measure`. |
| `/runs` | `RunsPage` | Lista runs. |
| `/runs/:id` | `RunDetailPage` | Detaljer och delning av run. |
| `/share/:id` | `ShareRunPage` | Publik vy av delat run. |
| `/event/:id` | `EventLeaderboardPage` | Leaderboard för event. |
| `/events/new` | `CreateEventPage` | Skapa nytt event. |
| `/events/:id/live` | `LiveViewerPage` | Livevisning i `EventSessionBoundary`. |
| `/events/:id/live/leaderboard` | `LiveLeaderboardPage` | Live leaderboard. |
| `/events/:id/live-host` | `EventLiveHostPage` | Host-kontroller. |
| `/events/:id/live-view` | `EventLiveViewerPage` | Viewer UI. |
| `/events/:id/admin/clips` | `EventClipsAdminQueue` | Moderation av clips. |
| `/events/:id/admin/moderation` | `EventClipModerationPage` | Detaljmoderation. |
| `/events/:id/top-shots` | `EventTopShotsPage` | Top-shot lista. |
| `/join` `/join/:code` | `JoinEventPage` | Gå med i event via kod. |
| `/:eventId/live/:roundId` | `LiveRoundRoute` | Direktlänk till liveström. |
| `/field-runs` | `FieldRunsPage` | Fälttester/benchmark runs. |
| `/device-dashboard` | `DeviceDashboardPage` | Enhetsstatus. |
| `/accuracy` | `AccuracyDashboardPage` | Precisionstestpanel. |
| `/admin/feedback` | `FeedbackAdminPage` | Feedback-inbox. |
| `/reels` | `ReelsComposerPage` | Skapa reels. |
| `/range/practice` | `RangePracticePage` | Range practice med CV-analys och spel. |
| `/range/score` | `RangeScorePage` | Visar range-resultat. |
| `/profile` | `MyGolfIQPage` | Profil och historik. |
| `/bag` | `MyBagPage` | Klubbsammansättning och gapping. |
| `/settings` | `SettingsPage` | Inställningar/feature-flaggor. |
| `/courses/demo` | `CourseDemoPage` | Demo av kursbundles. |
| `/dev/caddie-insights` | `CaddieInsightsPreviewPage` | Utvecklarvy för caddie-insikter. |
| `/dev/hud-preview` | `HudPreviewPage` | HUD-förhandsvisning. |
| `/play` | `QuickRoundStartPage` | Start av snabbrunda (hämtar course + hero-listor). |
| `/play/:roundId` | `QuickRoundPlayPage` | Aktiv snabbrunda. |
| `/trip/start` | `TripStartPage` | Starta trip-scoreboard. |
| `/trip/:tripId` | `TripScoreboardPage` | Trip scoreboard (privat). |
| `/trip/share/:token` | `PublicTripScoreboardPage` | Publik delning av trip. |
| `/qa/replay` | `ReplayAnalyzerPage` (flagga) | QA-replay när `qaReplayEnabled` är sant. |

## State & dataflöde
- SPA:n laddar PlayerOverlay och CDN-preconnect globalt; livevyer omsluts av `EventSessionBoundary` för att hämta event-sessioner innan render. 【F:web/src/App.tsx†L26-L103】
- API-bas (`VITE_API_BASE`) och nyckel (`VITE_API_KEY`) läses vid bootstrap och används av hooks/klienter under `web/src/api`/`web/src/hooks` för backend-anrop.
- Quick Round-starten hämtar både legacy course-listor och hero-katalog, sätter tee/hålmetadata och sparar rundstate innan navigation till `/play/:roundId`. 【F:web/src/pages/quick/QuickRoundStartPage.tsx†L86-L156】
- Feature-flaggor och access-planer hämtas via `/api/access/plan` och injiceras via access-provider; inställningssidan låter användaren toggla lokala flaggor.
