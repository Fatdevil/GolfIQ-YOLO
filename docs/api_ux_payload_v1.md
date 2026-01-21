# API: ux_payload_v1

`ux_payload_v1` is the unified mobile UX contract returned by analysis endpoints.
Clients should read the top-level `ux_payload_v1` field directly (no metrics parsing).

## Schema

The canonical JSON Schema is available at:

- [`docs/schemas/ux_payload_v1.schema.json`](schemas/ux_payload_v1.schema.json)

## Endpoints

| Endpoint | Mode | Notes |
| --- | --- | --- |
| `POST /cv/analyze` | swing | ZIP frame upload |
| `POST /cv/analyze/video` | swing | Video upload |
| `POST /range/practice/analyze` | range | Range practice capture |

## Response Envelope

All analysis responses include:

- `ux_payload_v1`: unified UX payload (or `null` if unavailable)
- existing fields (e.g., `metrics`, `events`, `run_id`) remain unchanged

### Demo Mode

Add `demo=true` (or `demo=1`) to return deterministic, mock results without model
loading. Demo responses include a concise `summary` field and a stable
`ux_payload_v1`. Demo mode forces a mock-safe detector variant and ignores
`MODEL_VARIANT`.

#### Example

`POST /cv/analyze?demo=true`

## Compatibility policy

- Clients should branch on `ux_payload_v1.version`.
- Optional sub-objects (`hud`, `explain`, `coach`, `confidence`, `debug`) may be
  `null` or omitted, so be tolerant when rendering.
- Demo responses keep the same `mode` as the endpoint context (swing or range),
  and include a concise `summary` at the top level.

## Example JSON

### Swing READY (cv analyze)

```json
{
  "run_id": "run-123",
  "events": [4],
  "metrics": {"ball_speed_mps": 31.2},
  "ux_payload_v1": {
    "version": "v1",
    "mode": "swing",
    "state": "READY",
    "confidence": {"score": 92, "label": "HIGH"},
    "hud": null,
    "explain": {"version": "v1", "confidence": {"score": 92, "label": "HIGH"}},
    "coach": {"version": "v1", "enabled": true, "tips": []},
    "debug": null
  }
}
```

### Range WARN (range practice)

```json
{
  "run_id": "range-456",
  "ball_speed_mps": 30.4,
  "carry_m": 95.0,
  "ux_payload_v1": {
    "version": "v1",
    "mode": "range",
    "state": "WARN",
    "confidence": {"score": 62, "label": "MED"},
    "hud": {"state": "warn", "score_0_100": 62},
    "explain": {"version": "v1", "confidence": {"score": 62, "label": "MED"}},
    "coach": {"version": "v1", "enabled": true, "tips": []},
    "debug": {"flags": ["fps_low"]}
  }
}
```

### Demo BLOCK (cv analyze demo)

```json
{
  "run_id": "demo-789",
  "events": [4],
  "metrics": {"ball_speed_mps": 21.4},
  "ux_payload_v1": {
    "version": "v1",
    "mode": "swing",
    "state": "BLOCK",
    "confidence": {"score": 18, "label": "LOW"},
    "hud": {"state": "block", "score_0_100": 18},
    "explain": {"version": "v1", "confidence": {"score": 18, "label": "LOW"}},
    "coach": {"version": "v1", "enabled": true, "tips": []},
    "debug": null
  },
  "summary": "demo mode: synthetic swing analysis"
}
```
