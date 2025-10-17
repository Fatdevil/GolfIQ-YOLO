# AR HUD Overlay QA Flow

This standalone entry renders the on-course HUD overlay without touching the main
Expo navigation stack. The overlay screen fetches course bundles, renders the
plan-view layer, and exposes the nearest hazard distance for quick QA passes.

## Launching the overlay

```sh
EXPO_ENTRY=app/qa-overlay-entry.tsx bunx expo start
```

The custom entry points directly to `QAArHudOverlayScreen`, so there are no
changes to `App.tsx` or the existing QA navigation. When the QA HUD gate is not
enabled (environment variable `QA_HUD=1`, `EXPO_PUBLIC_QA_HUD=1`, or the
remote-config flag), the screen renders nothing, allowing the entry to be kept
in source control without affecting production builds.

## Bundle fetching and caching

The overlay relies on `shared/arhud/bundle_client` for bundle lifecycle
management:

- `GET /bundle/index` enumerates available course bundles.
- `GET /bundle/course/{id}` loads the selected bundle and writes it to the
  Expo documents directory under `bundles/<id>.json`.
- ETags are persisted alongside each cached bundle. When the local TTL expires,
  the client revalidates the cached entry with `If-None-Match` to avoid
  unnecessary downloads.
- When the network is unavailable, the last cached bundle is used and the UI
  shows an "Offline" badge.

Caching happens transparently in both Expo and Node environments (tests use the
Node filesystem backend). Telemetry hooks emit `bundle.fetch` events so we can
instrument cache usage during QA sessions.

## Overlay rendering and interaction

- Course selection is fetched from the bundle index and remembered locally.
- A minimal camera stub runs under the overlay to mimic live frames.
- Greens, fairways, bunkers, hazards, and cart paths are rendered from bundle
  geometry using simple line primitives.
- Heading updates at ~5 Hz via the existing magnetometer helper.
- Hazard distance is recomputed on the same cadence so QA can confirm the
  nearest-edge calculation quickly.

## Performance tips

- Keep two or three bundles cached locally before going offline to validate the
  HUD at the course.
- Large bundles (many polygons) can make the overlay dense; use the refresh
  button to re-fetch the index after server-side changes.
- When testing offline behaviour, disable networking after a bundle finishes
  downloading to force the cache path.

