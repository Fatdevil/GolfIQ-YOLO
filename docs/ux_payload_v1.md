# UX Payload v1

## Purpose
`ux_payload_v1` provides a single, stable contract that mobile clients (iOS/Android)
can render without understanding internal metrics. It unifies the range HUD,
explainability, and micro-coach tips into one deterministic payload for premium UI
and investor demos.

## Schema
```json
{
  "version": "v1",
  "mode": "range" | "swing" | "unknown",
  "state": "READY" | "WARN" | "BLOCK" | "UNKNOWN",
  "confidence": {
    "score": 0,
    "label": "HIGH" | "MED" | "LOW"
  },
  "hud": { /* range_mode_hud payload */ },
  "explain": { /* explain_result_v1 payload */ },
  "coach": { /* micro_coach_v1 payload */ },
  "debug": {
    "case_id": "optional id",
    "timestamps": { "optional": true },
    "flags": ["optional", "flags"]
  }
}
```

### Field notes
- `version`: contract version for mobile clients.
- `mode`: capture context (`range` for range mode, `swing` for swing analysis).
- `state`: user-facing readiness. Prefer range HUD state, otherwise derived from
  explain confidence.
- `confidence`: pass-through of explain confidence if available.
- `hud`: range mode HUD payload (or `null` when unavailable).
- `explain`: explainability payload (or `null` when unavailable).
- `coach`: micro-coach payload (or `null` when unavailable, tips capped at 3).
- `debug`: optional minimal debug metadata (kept intentionally small).

## Example payloads

### READY
```json
{
  "version": "v1",
  "mode": "swing",
  "state": "READY",
  "confidence": { "score": 92, "label": "HIGH" },
  "hud": { "score_0_100": 92, "state": "ready" },
  "explain": { "version": "v1", "confidence": { "score": 92, "label": "HIGH" } },
  "coach": { "version": "v1", "enabled": true, "tips": [] },
  "debug": null
}
```

### WARN
```json
{
  "version": "v1",
  "mode": "range",
  "state": "WARN",
  "confidence": { "score": 62, "label": "MED" },
  "hud": { "score_0_100": 62, "state": "warn" },
  "explain": { "version": "v1", "confidence": { "score": 62, "label": "MED" } },
  "coach": { "version": "v1", "enabled": true, "tips": [] },
  "debug": { "flags": ["fps_low"] }
}
```

### BLOCK
```json
{
  "version": "v1",
  "mode": "range",
  "state": "BLOCK",
  "confidence": { "score": 20, "label": "LOW" },
  "hud": { "score_0_100": 20, "state": "block" },
  "explain": { "version": "v1", "confidence": { "score": 20, "label": "LOW" } },
  "coach": { "version": "v1", "enabled": true, "tips": [] },
  "debug": null
}
```
