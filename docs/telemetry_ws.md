# Telemetry WebSocket & Flight Recorder

## Endpoints

### `POST /telemetry`

Send a single telemetry sample using the shared schema:

```json
{
  "timestampMs": 1717171717,
  "club": "7i",
  "ballSpeed": 61.5,
  "clubSpeed": 72.0,
  "launchAngle": 14.2,
  "spinRpm": 3200,
  "carryMeters": 150.4
}
```

The payload is validated via Pydantic and then broadcast to any connected WebSocket clients.

### `GET /ws/telemetry`

Establish a WebSocket connection to receive real-time telemetry updates. Each message is a JSON object with the same shape as the POST payload (nullable fields are transmitted as `null`).

## Manual Live View

A lightweight static page is available at `/telemetry-live.html` (served from the web build's public directory). Open it locally while the server is running to see live “cards” update as telemetry events are published.

## Flight Recorder

Events can be sampled to disk as JSON Lines files for later analysis.

- `FLIGHT_RECORDER_PCT` (default: `5.0`) — percentage of events to record. `0` disables recording, `100` records every event.
- `FLIGHT_RECORDER_DIR` (default: `var/flight` inside the repository) — directory where files named `flight-YYYY-MM-DD.jsonl` are stored.

Sampling is deterministic per-process and designed to be safe for CI usage.
