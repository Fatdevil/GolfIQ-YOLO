# AR HUD Geospatial Anchors & Bundle Refresh

## Overview
The AR HUD now attempts to anchor pins and green markers using platform geospatial APIs (ARKit `ARGeoAnchor` on iOS, ARCore Geospatial/VPS on Android). When geospatial tracking is unavailable or not yet localized, the experience falls back to the previous compass-based plan anchors. A persistent cache respects server ETags and Cache-Control TTL for `/course/{id}` bundles, refreshing automatically and via a manual control.

## iOS
- Requests full accuracy location permissions (`requestTemporaryFullAccuracyAuthorization`) and checks `ARGeoTrackingConfiguration.checkAvailability` before starting an AR session.
- When the current frame reports `geoTrackingStatus.state == .localized` with `.high` accuracy, calibration drops `ARGeoAnchor`s for Pin/F/C/B using the device's altitude.
- If geospatial accuracy is low or unavailable the HUD clearly falls back to compass mode, reinstating plan anchors and keeping the badge in "Compass" state.
- Manual refresh is exposed via the AR HUD settings table; selecting **Refresh bundle** re-fetches the course with `If-None-Match`, respecting TTL and emitting telemetry.
- Telemetry emits `bundle_refresh` with `{status: 200|304|offline, etag?, age_days}` for each refresh attempt.

## Android
- Enables ARCore geospatial mode when the device `Session` reports support for `Config.GeospatialMode.ENABLED`; otherwise it remains in compass mode.
- During calibration, if `session.earth` is TRACKING, anchors are created through `Earth.createAnchor` for Pin/F/C/B and rendered via Sceneform `AnchorNode`s. Fallback path retains the compass behaviour, and the HUD badge shows "Compass".
- `CourseBundleRepository` persists bundle bodies + metadata (`etag`, fetch timestamp, TTL) in app storage. Refreshes run `HEAD` followed by conditional `GET`, recording telemetry and reusing cached data on 304 or offline (with TTL-aware age reporting).
- Settings include a **Refresh bundle** button wired to a simple in-app bus so the HUD activity can force a manual refresh.

## Cache & TTL Behaviour
- Both platforms persist the last ETag, fetch timestamp, and server-provided `max-age` TTL.
- On HUD start (or manual refresh) the client issues `HEAD /course/{id}` with `If-None-Match`. A `304` updates metadata without re-downloading, while `200` triggers a full `GET` to store the new payload.
- Network failures fall back to cached bundles when available; telemetry records these as `status: offline` along with the age in days.

## User Experience Cues
- The HUD overlay shows a badge labelled **Geospatial** while geospatial anchors are active, switching to **Compass** when falling back.
- Status messages guide the golfer (e.g., "Geospatial localization not ready" before fallback) and manual refresh calls out when data is refreshed vs. offline.
