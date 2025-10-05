# Remote Config (Device Tier Feature Flags)

The remote configuration endpoint exposes lightweight JSON feature overrides for
mobile clients. Configuration is stored in-memory inside the API process and is
primarily intended for internal experimentation across device performance tiers
(A/B/C).

## Endpoint Overview

| Method | Path              | Description                               |
| ------ | ----------------- | ----------------------------------------- |
| GET    | `/config/remote`  | Fetch the current configuration snapshot. |
| POST   | `/config/remote`  | Replace the configuration (admin only).   |

### Default Payload

```json
{
  "tierA": {
    "hudEnabled": true,
    "inputSize": 320,
    "analyticsEnabled": false,
    "crashEnabled": false
  },
  "tierB": {
    "hudEnabled": true,
    "inputSize": 320,
    "reducedRate": true,
    "analyticsEnabled": false,
    "crashEnabled": false
  },
  "tierC": {
    "hudEnabled": false,
    "analyticsEnabled": false,
    "crashEnabled": false
  }
}
```

### HTTP Caching

GET responses include an `ETag` header that is the SHA-256 hash of the JSON
payload. Clients should send `If-None-Match` on subsequent fetches and treat a
`304 Not Modified` response as a signal to reuse their cached configuration.

Responses are marked `Cache-Control: no-cache` to avoid intermediary caching.

### Admin Updates

`POST /config/remote` requires the `ADMIN_TOKEN` environment variable to be set.
Requests must include a `X-Admin-Token` header matching the configured value and
originate from the same origin as the API host (simple localhost safeguard).
The payload must contain `tierA`, `tierB`, and `tierC` objects.

Successful updates echo the stored configuration and the fresh `ETag`.

## Client Usage Pattern

1. Fetch on app start (with `If-None-Match` if a cached `ETag` exists).
2. When a new configuration is returned, select the tier-specific overrides and
   merge them with the device defaults.
3. Apply overrides for:
   - `hudEnabled`
   - `inputSize`
   - `reducedRate`
   - `analyticsEnabled`
   - `crashEnabled`
4. Log the active `ETag` (or hash) through telemetry for observability.
5. Refresh periodically (clients poll every 12 hours).

Clients are resilient to partial payloads—unknown keys are ignored, and missing
keys fall back to defaults computed from the device tier.
