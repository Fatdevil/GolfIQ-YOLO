# Watch HUD API Contract

This document describes the endpoints and payloads that power the GolfIQ watch HUD
on watchOS and Wear OS. The HUD surfaces the critical next-shot context in a single
round-trip so the native UI can focus on rendering.

## Overview

The HUD is designed around two calls:

* **`POST /api/watch/hud/hole`** – fetch the full HUD snapshot when a player starts a
  round, moves to a new hole, or needs to refresh the on-watch cache.
* **`POST /api/watch/hud/tick`** – heartbeat invoked every 3–5 seconds while the player
  is on-course. It returns lightweight updates (distance, plays-like, tips) so the watch
  face can animate without re-fetching the full payload.

Both endpoints require the standard `x-api-key` header when API key enforcement is
enabled.

### Recommended UI Layout

* Primary readout: remaining distance to the green (`toGreen_m`), shown in meters with
  unit suffix.
* Secondary line: plays-like adjustment (`playsLike_m`) and wind arrow derived from
  `wind_mps` and `wind_dir_deg`.
* Supplemental: tip bubble that expands when `activeTip` is present and `hasNewTip`
  toggles true on the tick response.
* Optional map view: render the `fairway_path`, `green_center`, and `ball_position`
  when available.

## Endpoint Reference

### `POST /api/watch/hud/hole`

Request body:

```json
{
  "memberId": "string",
  "runId": "string",
  "hole": 1,
  "courseId": "demo-links",
  "lat": 37.4331,
  "lon": -122.1585,
  "wind_mps": 5.6,
  "wind_dir_deg": 305,
  "temp_c": 19.0,
  "elev_delta_m": -3.2
}
```

Response body (`HoleHud` schema):

```json
{
  "eventId": "evt-123",
  "runId": "run-456",
  "memberId": "member-789",
  "courseId": "demo-links",
  "hole": 7,
  "par": 5,
  "strokeIndex": 3,
  "toGreen_m": 162.4,
  "toFront_m": 148.0,
  "toBack_m": 176.2,
  "toLayup_m": 95.0,
  "playsLike_m": 157.8,
  "caddie_confidence": 0.78,
  "caddie_silent": false,
  "caddie_silent_reason": null,
  "wind_mps": 6.2,
  "wind_dir_deg": 310,
  "temp_c": 18.5,
  "elev_delta_m": -4.3,
  "shotsTaken": 2,
  "sg_delta_total": 0.35,
  "sg_delta_last_shot": 0.18,
  "fairway_path": [
    {"lat": 36.87012, "lon": -121.56789},
    {"lat": 36.87092, "lon": -121.56845}
  ],
  "green_center": {"lat": 36.87123, "lon": -121.56897},
  "ball_position": {"lat": 36.87055, "lon": -121.56812},
  "activeTip": {
    "tipId": "tip-991",
    "title": "9i knockdown",
    "body": "Play a flighted shot – wind is hurting.",
    "club": "9i",
    "playsLike_m": 155.0
  }
}
```

Use this endpoint whenever the watch needs a complete state refresh.

### `POST /api/watch/hud/tick`

Request body:

```json
{
  "memberId": "string",
  "runId": "string",
  "hole": 7,
  "deviceId": "watch-abc",
  "courseId": "demo-links",
  "lat": 36.87055,
  "lon": -121.56812,
  "wind_mps": 6.0,
  "wind_dir_deg": 320,
  "temp_c": 18.0,
  "elev_delta_m": -2.5
}
```

Response body (`TickOut` schema):

```json
{
  "hole": 7,
  "courseId": "demo-links",
  "toGreen_m": 160.0,
  "toFront_m": 146.5,
  "toBack_m": 174.3,
  "playsLike_m": 155.5,
  "caddie_confidence": 0.74,
  "caddie_silent": false,
  "caddie_silent_reason": null,
  "activeTip": {
    "tipId": "tip-991",
    "title": "9i knockdown",
    "body": "Play a flighted shot – wind is hurting.",
    "club": "9i",
    "playsLike_m": 155.0
  },
  "hasNewTip": true
}
```

Call this endpoint during the swing pre-shot routine. If `hasNewTip` flips to `true`,
trigger a subtle haptic or animation. When `activeTip` is `null`, collapse the tip bubble.

## Minimal Payload Example

For situations where advanced telemetry is unavailable, the APIs degrade gracefully:

```json
{
  "eventId": "evt-stub",
  "runId": "run-456",
  "memberId": "member-789",
  "hole": 7,
  "shotsTaken": 0,
  "sg_delta_total": null,
  "sg_delta_last_shot": null,
  "fairway_path": null,
  "green_center": null,
  "ball_position": null,
  "activeTip": null
}
```

The watch UI should continue rendering the available fields and omit absent data.

### Caddie + Tournament Safety

The HUD always reflects the caddie engine state. When `caddie_silent` is `true`, the
`playsLike_m` field is suppressed and `caddie_silent_reason` explains why (for example,
`"tournament_safe"` or `"low_confidence"`). Tournament-safe rounds automatically set
`caddie_silent` to `true` so the watch never surfaces aggressive recommendations while
competition guards are active.

## Refresh Cadence Summary

| Situation                     | Endpoint                | Cadence        |
| ----------------------------- | ----------------------- | -------------- |
| Player opens round / new hole | `POST /api/watch/hud/hole` | Once per hole |
| In-play heartbeat             | `POST /api/watch/hud/tick` | Every 3–5 s    |
| Tip acknowledgement           | `POST /api/watch/hud/tick` | Next heartbeat |

This cadence keeps bandwidth low while ensuring critical guidance is up to date for
the player.
