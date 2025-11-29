# GolfIQ Play – Player Home

The mobile player home screen greets the member, surfaces their current access plan, and offers quick actions to start playing or exploring GolfIQ tools.

## Data sources
- `GET /api/profile/player` → `PlayerProfile` (name/member ID, development plan)
- `GET /api/access/plan` → `AccessPlan` (free/pro, trial/expiry)
- `GET /api/analytics/player` → `PlayerAnalytics` (Pro only, used for the last-round preview when available)

The client reads `MOBILE_API_BASE`/`MOBILE_API_KEY` (or Expo equivalents) to build requests and passes the API key as `x-api-key` when configured.

## UI highlights
- Greeting with the player name and a small badge for the current plan (Free/Pro/Trial).
- Primary CTA: **Play round** (navigates to the round setup placeholder).
- Secondary actions: Range practice, Trips & buddies.
- Last round summary: shows the latest analytics snapshot when available or a friendly empty state.

Pro-only analytics are tolerated; the home shell still renders even if analytics are unavailable for Free users.
