# Stability & Analytics Baseline

This document describes the rebuilt crash reporting and analytics baseline for
Android, iOS, and the web clients. Instrumentation is intentionally gated behind
feature flags and remote-config driven kill-switches to keep the experience
privacy-preserving by default.

## Feature Flags

Two new remote-controllable feature flags drive telemetry behaviour across the
stack:

| Flag | Description | Default |
| ---- | ----------- | ------- |
| `analyticsEnabled` | Enables non-crash analytics such as Sentry breadcrumbs and performance traces. | `false` |
| `crashEnabled` | Enables crash reporting (Sentry + `/telemetry` `app_crash` marker). | `false` |

Flags live alongside existing HUD controls inside `FeatureFlagConfig` on mobile
and are mapped from remote config snapshots with safe defaults.

## Remote Config Keys

The `/config/remote` endpoint now persists both flags for each tier. Example:

```json
{
  "tierA": {
    "hudEnabled": true,
    "inputSize": 320,
    "analyticsEnabled": false,
    "crashEnabled": false
  }
}
```

`POST /config/remote` accepts boolean overrides for both keys. Missing entries
fall back to `false` which effectively keeps telemetry disabled.

## Environment Variables / DSNs

| Platform | Variable | Notes |
| -------- | -------- | ----- |
| Android/iOS | `SENTRY_DSN_MOBILE` | Consumed on app start to initialise the mobile Sentry SDK when flags allow. |
| Web | `VITE_SENTRY_DSN` | Read at build/runtime; the web bundle initialises Sentry only if this and the kill-switch allow. |

No DSN → no Sentry initialisation, regardless of flags.

## Kill-Switch & Sampling Behaviour

* Remote config must explicitly set `analyticsEnabled`/`crashEnabled` to `true`.
* Clients emit a one-time `analytics_cfg` telemetry event with `{enabled, analyticsEnabled, crashEnabled, dsn_present, configHash}` for observability.
* Crash handlers post a minimal `/telemetry` payload: `{ "event": "app_crash", "platform": "android|ios|web", "sampled": true, "ts": <epoch_ms>, "thermal": "unknown", "batteryPct": -1 }`.
* Sentry traces are sampled at `20%` (`tracesSampleRate = 0.2`).
* Crashes are always captured when `crashEnabled == true` regardless of sampling.

The web client honours an optional runtime kill-switch via `window.__analyticsEnabled` (defaults to `true`).

## Privacy Scrubbing Rules

Across all platforms the scrubbers enforce:

* Drop user identifiers, requests, IP addresses, and server names.
* Remove breadcrumbs that resemble PII (emails, `email`, `ssn` markers) and cap to 30 entries.
* Truncate stack traces to the most recent 20 frames.
* Clear large `extra` payloads and device contexts to avoid leaking model/geo data.

Telemetry crash markers never include stack traces—only metadata and coarse
battery/thermal hints.

## Telemetry Bridge

When `crashEnabled` is active, a lightweight uncaught-exception handler posts the
`app_crash` event to the server before delegating to the original handler. On
Android/iOS this uses a direct HTTP POST to the backend; the web layer relies on
Sentry to capture the error (the bridge still emits `analytics_cfg`).

## Toggling via Remote Config

Example commands (replace `<ADMIN_TOKEN>` and `<BASE_URL>`):

```bash
# Enable analytics and crash reporting for Tier A only
curl -X POST "<BASE_URL>/config/remote" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{
        "tierA": {"hudEnabled": true, "inputSize": 320, "analyticsEnabled": true, "crashEnabled": true},
        "tierB": {"hudEnabled": true, "inputSize": 320, "reducedRate": true},
        "tierC": {"hudEnabled": false}
      }'

# Disable all telemetry again
curl -X POST "<BASE_URL>/config/remote" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{
        "tierA": {"hudEnabled": true, "inputSize": 320, "analyticsEnabled": false, "crashEnabled": false},
        "tierB": {"hudEnabled": true, "inputSize": 320, "reducedRate": true, "analyticsEnabled": false, "crashEnabled": false},
        "tierC": {"hudEnabled": false, "analyticsEnabled": false, "crashEnabled": false}
      }'
```

Remember to keep secrets (DSNs, admin tokens) out of source control—configure
via environment variables or secret stores in deployment.
