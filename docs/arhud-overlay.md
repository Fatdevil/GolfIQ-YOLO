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
- The pin panel adds "Set Pin" (captures the aimpoint at the crosshair) and
  "Clear Pin" actions for quick targeting. Once a pin is set, the overlay shows
  the live distance/bearing to that point and emits `hud.pin.set`,
  `hud.pin.clear`, and `hud.frame` (`pinDist`) QA events. The nearest hazard
  callout compares the hazard bearing against the smoothed heading using
  `((bearing - heading + 540) % 360) - 180`; negative values label the hazard as
  `LEFT`, positive values as `RIGHT`.

## Performance tips

- Keep two or three bundles cached locally before going offline to validate the
  HUD at the course.
- Large bundles (many polygons) can make the overlay dense; use the refresh
  button to re-fetch the index after server-side changes.
- When testing offline behaviour, disable networking after a bundle finishes
  downloading to force the cache path.


## QA Launcher

When the regular Expo entry point is running with the QA HUD gate enabled, a
floating "QA" button appears in the bottom-right corner. Enable the gate with
any of the following:

- Set `QA_HUD=1` in the environment before launching the app (works in
  production-like builds).
- In local development (`__DEV__`), set `QA_DEV=1` to surface the launcher
  without toggling the production flag.
- Remote config can also flip the gate by returning `RC["qa.hud.enabled"]=true`.

Tapping the button opens an action sheet with "Open AR-HUD Overlay" and
"Cancel" options. Selecting the open action mounts the overlay as a modal, and a
"Close" button in the top-left corner returns to the underlying QA screens.

## Auto-picking courses

The overlay can now suggest course bundles based on the device GPS. Enable the
"Auto-pick course" toggle in the course panel to start polling for a location
fix. The helper requests foreground permissions via `expo-location`; if the
user denies access we simply disable the feature and keep the manual picker.

- Location fixes are debounced to ~10 seconds to avoid draining the battery.
- A prompt appears only when the nearest course moves at least 300 m closer
  than the previous candidate and remains within 1.5 km of the device. This
  prevents rapid flip-flopping near course boundaries.
- Dismissing the prompt mutes further prompts for ten minutes unless the user
  explicitly enables it again.
- Accepting a suggestion switches the course and logs a telemetry event with
  `{ event: 'bundle.autopick', id, dist_m }` so we can monitor adoption.

Auto-pick reuses the bundle index and cache from `shared/arhud/bundle_client`,
so previously loaded bundles stay available offline. When testing in flight mode
keep a few bundles cached ahead of time; the auto-picker will continue to pick
from the cached index even without network access.
