# Web tracer, ghost frames, and live telemetry cards

This document summarizes how the web SPA renders the back-view tracer overlay, key-frame ghosts, and live telemetry metric cards.

## Feature toggle

All new UI elements are gated by the `visualTracerEnabled` flag (defaults to `true`). Set the `VITE_VISUAL_TRACER_ENABLED` env var to `false` when building the web app to disable the overlay, ghost markers, and live telemetry cards without touching the code.

```
VITE_VISUAL_TRACER_ENABLED=false pnpm build
```

## Back-view payload expectations

Both `Analyze` and `RunDetail` pages call `extractBackViewPayload` from `web/src/lib/traceUtils.ts` to normalize backend responses. The helper accepts multiple shapes and returns:

- `trace`: `{ width, height, points[], apexIndex?, landingIndex?, normalized? }`
- `ghostFrames`: array of `{ label, timestampMs?, frameIndex?, position? }`
- `quality`: key-value map used for UI badges.
- `source`: pipeline identifier (e.g. `cv-back-v2`).
- `videoUrl`: optional URL for the preview element.

The extractor accepts nested objects such as `metrics.back_view.tracer.points` or legacy fields like `trace.path`. Add new aliases there to keep pages unaware of backend tweaks.

## Rendering flow

### Analyze page

1. The analyzer response is stored in local state (`result`).
2. `extractBackViewPayload(result)` resolves the normalized overlay payload.
3. When `visualTracerEnabled` is true and data exists:
   - `<TracerCanvas>` draws the smoothed trajectory with apex/landing markers.
   - `<GhostFrames>` places labeled ghost markers for address, top, impact, and follow-through samples.
   - Quality flags and the reported source are displayed next to the preview.
4. `<LiveCards>` opens a websocket to `/ws/telemetry` for live ball speed, club speed, launch angles, and carry distance cards.

### Run detail page

`RunDetail` applies the same helper against persisted run JSON and shows:

- The tracer overlay + ghost markers if `back_view` data is stored with the run.
- Quality badges (or a fallback note) and CV source headers (`x-cv-source`).
- The raw payload panel remains unchanged for debugging.

## Telemetry websocket

`LiveCards` constructs its websocket URL by reusing `VITE_API_BASE` (HTTP → WS). Messages are expected to be JSON objects; the component accepts snake_case or camelCase keys.

Example payload:

```json
{
  "ball_speed_mps": 70.2,
  "club_speed_mps": 48.1,
  "side_angle": -1.8,
  "vert_launch": 14.2,
  "carry_m": 182.3
}
```

The component also calculates derived units:

- mph from the provided m/s speeds.
- yards from carry meters.

If the websocket disconnects, an automatic reconnect is attempted every 3 seconds. The status indicator in the header shows `Live`, `Connecting`, `Disconnected`, or `Error`.

## Graceful fallbacks

- Missing tracer points → “No tracer points provided” overlay text.
- Missing ghost frames → component renders nothing.
- Missing quality map → fallback note.
- Missing preview URL → placeholder panel with guidance text.
- Websocket unavailable → status badge changes and cards stay populated with the last known values.

Keep these behaviours in mind when adjusting backend payloads so that the UI fails soft instead of crashing.
