# AR HUD On-course Overlay (QA)

The QA HUD screen now exposes a lightweight course overlay to visualise offline bundles and measure hazard distances during field testing.

## Course picker

* Enabled only when the QA HUD gate resolves to `true` (env flag or dev build).
* Fetches `/bundle/index` via `shared/arhud/bundle_client`.
* The most recent selection is persisted under `documentDirectory/bundles/selection.json` and restored on next launch.
* Picker entries display the server `name` (if present) and `updatedAt` timestamp.

## Bundle client + cache policy

* Bundles and the index are stored under `documentDirectory/bundles/`.
  * Index: `index.json`.
  * Bundles: `<courseId>.json`.
* `ETag` and `Cache-Control` (max-age) headers drive revalidation.
  * Active cache respected until TTL expiry; afterwards a background refresh is triggered.
  * If the network fails, the cached payload is served with `offline` badge in the UI.
* Telemetry logs every fetch: `{ id, etag, fromCache, stale, timestamp }`.

## Rendering notes

* Geometry is projected to a local ENU plane via `shared/arhud/geo.toLocalENU` (simple equirectangular, sufficient for single-course extents).
* Greens, fairways, bunkers, hazards, cart paths, and water render on an `Svg` overlay above the camera preview.
* Heading is visualised with a forward vector from the user dot.
* Zoom controls adjust the overlay scale (0.4× – 3×).

## Distance cards

* `distancePointToLineString` and `distancePointToPolygonEdge` report the nearest hazard edge distance in metres.
* Updated at 5 Hz.
* Hazards include `bunker`, `hazard`, and `water` feature types (line or polygon).

## Performance tips

* Bundles should remain <200 kB to keep parse + render cost minimal.
* Avoid oversized multipolygons; the overlay recomputes paths on every zoom change.
* When testing on-device, verify overlay responsiveness with and without network connectivity.
