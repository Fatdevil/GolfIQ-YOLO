# Cloud Sync v1 (Supabase)

GolfIQ now supports optional Supabase-backed sync for live events and round backups. The app remains offline-first—cloud features activate only when Supabase environment variables are present.

## Prerequisites

1. Create a Supabase project.
2. Copy the project URL and anonymous public key.
3. In `golfiq/app/.env` (or Expo config), set:

```bash
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=ey...
```

For local development, duplicate `golfiq/app/.env.example` and fill in your values. CI runs without these variables (mock mode only).

## Database schema

Run the SQL in [`cloud/sql/001_init.sql`](../cloud/sql/001_init.sql) once inside your Supabase SQL editor. It creates the following tables with row-level security enabled:

- `rounds`: stores finished/resumable round summaries.
- `events`: live event metadata (host-controlled).
- `event_members`: event membership keyed by `auth.uid()`.
- `event_rounds`: live leaderboard submissions (one row per participant per round).

### Row-Level Security policies

The same SQL file defines policies:

- Rounds: only the authenticated owner can select/insert/update.
- Events: owners can CRUD; members (players) can only select via membership.
- Event members: hosts add members; members can view their own membership.
- Event rounds: hosts or members may insert/select; updates allowed by host or original submitter.

Supabase Studio → Authentication → Settings must have Anonymous sign-in enabled (no email/PII required).

## Running locally

1. Install dependencies in `golfiq/app` (already handled).
2. Provide `SUPABASE_URL` and `SUPABASE_ANON_KEY` (as above).
3. Start the app normally—when env vars are missing, the app falls back to an in-memory mock.

### Tests (mock backend)

Unit tests exercise the mock implementations and should pass without Supabase access:

```bash
npx vitest tests/events/cloudSync.spec.ts
npx vitest tests/rounds/cloudBackup.spec.ts
```

These cover event creation/joining, live leaderboard propagation, and round backup/listing.

## Using the features

### Live events

1. Open Event Dashboard.
2. Create an offline event as usual.
3. Tap **Create Live Event** to provision a cloud event. The host’s device receives a Join Code + QR.
4. Players join by entering the code (or scanning offline QR). When **Go Live** is enabled, remote spectators see updates in real time.
5. The summary screen also exposes **Post to Live Event** when the device is a member of an active cloud event.

### Round backups

When a round is finished, opt-in to cloud backup from the Summary screen. The round summary (aggregate stats, SG breakdown, FIR/GIR percentages) is stored in Supabase. Devices can list and restore available backups when Supabase is configured.

## Privacy & tournament safety

- Anonymous auth only—no email, phone, or location stored.
- Uploaded data is limited to round summaries and event leaderboards (strokes, SG, HCP, names typed by the host). Shot-by-shot data stays local.
- Live leaderboards expose scores and strokes gained totals only; no tactical hints or shot suggestions are transmitted.

## Troubleshooting

- If Supabase credentials are missing or invalid, the app reverts to mock mode (offline experience identical to previous releases).
- To reset the mock backend during tests, use the utilities exported from `golfiq/app/src/cloud/mockSupabase.ts`.
- Ensure SQL migrations ran before testing against a real Supabase project; missing tables or policies will surface as 401/permission errors.
