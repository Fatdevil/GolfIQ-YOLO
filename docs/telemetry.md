# Telemetry — AR-HUD v1

## Real-time Streaming

The telemetry service exposes a lightweight WebSocket channel so HUD and analysis clients can receive measurement samples as soon as they are ingested. Each connection is scoped to a `session_id` provided via the query string.

### WebSocket handshake

```javascript
// browser / node example
const socket = new WebSocket(`wss://golfiq.local/ws/telemetry?session_id=${sessionId}`);

socket.addEventListener('message', (event) => {
  const payload = JSON.parse(event.data);
  if (payload.type === 'hello') {
    console.log('connected to session', payload.session_id);
    return;
  }
  // Telemetry samples arrive as plain JSON objects.
  console.log('sample', payload);
});
```

```python
# Python (asyncio) example
import asyncio
import json
import websockets

async def listen(session_id: str) -> None:
    uri = f"ws://localhost:8000/ws/telemetry?session_id={session_id}"
    async with websockets.connect(uri) as websocket:
        async for message in websocket:
            payload = json.loads(message)
            print("sample", payload)

asyncio.run(listen("range-123"))
```

The first message returned after `accept()` is a small hello payload:

```json
{"type": "hello", "session_id": "range-123"}
```

## Batch ingestion endpoint

Send samples to the telemetry service in batches using `POST /telemetry/batch`. Each item in the payload is validated and immediately broadcast to the corresponding WebSocket listeners.

```http
POST /telemetry/batch
Content-Type: application/json

[
  {
    "session_id": "range-123",
    "ts": 1717.0,
    "frame_id": 42,
    "ball": {"x": 1.0, "y": 2.0, "v": 3.5}
  },
  {
    "session_id": "range-123",
    "ts": 1718.2,
    "impact": true,
    "club": {"x": 0.3, "y": 0.8, "v": 41.2}
  }
]
```

A successful ingest returns HTTP `202 Accepted` along with the number of samples accepted and how many websocket deliveries were attempted:

```json
{"accepted": 2, "delivered": 0}
```

> **Note:** The service fan-outs each accepted sample to every connected client in the given `session_id`. The `delivered` field
> reflects the number of websocket sends attempted across all connected clients.

## Telemetry sample schema

Each telemetry sample follows the schema enforced by the API:

| Field       | Type                  | Description                                            |
|-------------|-----------------------|--------------------------------------------------------|
| `session_id`| `string`              | Identifier of the running AR-HUD session (required).   |
| `ts`        | `number`              | Timestamp (seconds since epoch or monotonic source).   |
| `frame_id`  | `integer`             | Optional AR frame identifier.                          |
| `source`    | `string`              | Origin of the telemetry sample. Defaults to `"arhud"`. |
| `impact`    | `boolean`             | Optional flag for impact events.                       |
| `ball`      | `object`              | Optional nested metrics for the ball (position, speed).|
| `club`      | `object`              | Optional nested metrics for the club.                  |
| `launch`    | `object`              | Optional nested launch data.                           |
| `...`       | any                   | Additional fields are allowed and forwarded verbatim.  |

Samples may include extra keys which are passed through to WebSocket clients without modification.

## Metrics per session
- session_count, session_duration_s
- fps_avg, fps_p10
- hud_latency_ms_p50, hud_latency_ms_p90
- tracking_quality_p50
- anchor_resets_count
- thermal_warnings_count
- fallback_events_count

## Logs
- JSON, includes build_id and device_class, no PII/raw frames

## Traces
- <= 10% sessions sampled, remotely configurable

## Dashboards
- "AR-HUD v1" (owners: AR team)
- TODO: add links when dashboards are created
