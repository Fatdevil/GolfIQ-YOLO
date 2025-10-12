# AR HUD MVP

The mobile AR heads-up display (HUD) enables golfers to align with the target pin, calibrate device heading, and surface green front/center/back (F/C/B) distances on top of the real world without leaving the tee box.

## Feature flags

Two feature toggles control availability:

- `hudEnabled` *(default: false)* – master switch that enables the Aim → Calibrate and AR overlay surfaces.
- `hudTracerEnabled` *(default: false)* – renders tracer lines from the calibration origin to each marker to assist with debugging alignment.

Both flags live in the shared configuration bundle and can be overridden from the in-app HUD settings surfaces on iOS and Android.

## Core flows

### Aim → Calibrate

1. Load `/course/{id}` bundle (pin + green F/C/B coordinates).
2. Prompt the player to aim the device toward the pin, then tap **Aim → Calibrate**.
3. Capture the current device heading & location, compute the offset to the pin, and store an AR anchor.
4. Place pin + F/C/B markers relative to the anchor and emit `arhud_calibrate` telemetry.

### Re-center

1. When drift occurs, tap **Re-center**.
2. Reset AR world tracking, reapply the stored calibration anchor, and re-render markers.
3. Emit `arhud_recenter` telemetry.

## HUD overlay

- Persistent pin marker plus smaller markers for green front, center, and back, rendered in AR space.
- Overlay layer displays formatted yards for F/C/B along with contextual status copy.
- FPS sampling runs every ~5 seconds and emits `arhud_fps` to `/telemetry` (sampled).

## Platform implementations

### iOS (ARKit + SceneKit)

- `ARHUDViewController` owns an `ARSCNView`, overlay layer, CoreLocation updates, and telemetry hooks.
- `ARHUDCourseBundleLoader` fetches `/course/{id}` bundles, normalizing snake_case keys.
- Calibration stores heading offset + AR anchor, and positions nodes using a local ENU projection aligned to the user’s heading.
- `ARHUDSettingsViewController` provides toggles for `hudEnabled` and `hudTracerEnabled` inside the app settings surface.

### Android (ARCore + Sceneform)

- `ARHUDActivity` hosts an `ArFragment`, manages fused location updates, rotation vector heading, and telemetry.
- `CourseBundleRepository` loads bundles via `HttpURLConnection` and parses JSON using `JSONObject` to keep dependencies light.
- Calibration flow mirrors iOS: anchors to the camera pose, computes heading offset, and renders markers/tracers with `ShapeFactory`.
- `ARHUDSettingsFragment` exposes runtime toggles for `hudEnabled` / `hudTracerEnabled`.

## Telemetry

All calibrate, recenter, and FPS events post to the existing `/telemetry` client. Metric names:

- `arhud_calibrate`
- `arhud_recenter`
- `arhud_fps`

Values are numeric, deviceClass is `arhud`, and no PII is collected.

## Limitations & roadmap notes

- Geospatial anchors are optional and not enabled; calibration relies on world tracking + compass heading, so drift may occur on long sessions.
- No persistence of calibration between holes/rounds.
- Course bundle schema assumes pin + green F/C/B coordinates; hazards and elevation are out of scope for MVP.
- Error handling surfaces inline status copy only—future work could add retry UI and offline caching.

## UX sketch (textual)

```
+------------------------------------------+
|      [ Camera feed / AR world ]          |
|                                          |
|           (Pin marker ⚑)                 |
|         (F)  (C)   (B) markers           |
|                                          |
|   Status: "Aim at pin and calibrate"     |
|   [ Aim → Calibrate ]                    |
|   [ Re-center ]                          |
|   F: 145 yd  C: 160 yd  B: 172 yd        |
+------------------------------------------+
```

The overlay floats above the AR scene and remains readable in bright sunlight by using high-contrast typography.

## Calibration SLOs & smoothing quick-reference
- **Aim stability**: require pose variance ≤ `0.0125°²` before entering CALIBRATE.
- **Calibration quality**: heading RMS must land ≤ `1.75°` to accept calibration.
- **Tracking guardrails**: enforce ≤ `2.5°` RMS while rendering overlays; recenter after `15s` without a refresh.
- **Heading smoothing**: EMA operates on unwrapped headings to avoid wrap spikes (e.g. `359° → 2°`), with a rolling RMS window (default 20 samples) to decide when TRACK can continue or must recenter.
