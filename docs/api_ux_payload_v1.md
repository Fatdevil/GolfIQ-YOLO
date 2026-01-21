# API: ux_payload_v1

`ux_payload_v1` is the unified mobile UX contract returned by analysis endpoints.
Clients should read the top-level `ux_payload_v1` field directly (no metrics parsing).

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

## Example JSON

### Swing (cv analyze)

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
    "explain": null,
    "coach": null,
    "debug": null
  },
  "summary": "demo mode: synthetic swing analysis"
}
```

### Range (range practice)

```json
{
  "run_id": "range-456",
  "ball_speed_mps": 30.4,
  "carry_m": 95.0,
  "ux_payload_v1": {
    "version": "v1",
    "mode": "range",
    "state": "READY",
    "confidence": null,
    "hud": {"state": "ready"},
    "explain": null,
    "coach": null,
    "debug": null
  },
  "summary": "demo mode: synthetic range analysis"
}
```
