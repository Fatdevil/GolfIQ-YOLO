# GolfIQ Play – Watch HUD & QuickRound v1

This document summarizes the mobile-side flow for pairing a watch and pushing HUD snapshots from the in-round screen.

## Pairing and status

- **Status**: The Player Home renders `WatchStatusCard`, which calls `GET /api/watch/devices/status?memberId={id}` to show whether a paired device has been seen recently. The status card is Pro-gated; Free users see an upgrade prompt instead of the pairing UI.
- **Pair code**: Tapping **Pair watch** triggers `POST /api/watch/pair/code?memberId={id}` and shows the six-digit code plus an expiry countdown. The watch app enters this code and binds via `/api/watch/devices/bind`/`/api/watch/devices/token`.

## In-round HUD sync

- When the in-round screen mounts and whenever the current hole changes, a Pro user with a known member ID + run ID sends a quick-round sync via `POST /api/watch/quickround/sync`.
- `HudSyncService` builds a lightweight HoleHud draft from the local course bundle (hole number, par, stroke index, length) and includes it alongside the sync payload.
- Client errors (e.g., no paired watch) are swallowed with a console warning so scoring UI remains responsive.

## Access control

- Watch HUD pairing and sync are Pro-only, aligned with the AccessPlan system (`plan.plan === 'pro'`).
- Non-Pro users still see a "Watch HUD (Pro)" pill in-round but no network calls are made.
