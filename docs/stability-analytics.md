# Stability & Analytics Baseline

## Consent Language
- **Short form (in-app modal):** "We use privacy-safe diagnostics to improve GolfIQ. Share crash reports and anonymous performance metrics?"
- **Expanded details:** Crash reports and telemetry exclude email addresses, precise GPS coordinates, and user-entered text. Data is sampled at 20% by default and stored for operational troubleshooting only.

Users can opt-in/out at any time from **Settings → Privacy → Diagnostics**. Consent state is stored locally (`analytics_consent`) and must be true before any analytics pipeline is activated.

## Feature Toggles
Remote Config delivers the following booleans per device tier:

| Key | Default | Description |
| --- | --- | --- |
| `analyticsEnabled` | `true` | Master kill-switch for all analytics (Sentry + telemetry bridge). |
| `crashEnabled` | `true` | Enables crash capture + upload when analytics remain enabled. |
| `hudEnabled` | tier specific | Existing HUD toggle. |
| `inputSize` | tier specific | Existing inference resolution. |
| `reducedRate` | tier specific | Existing inference throttling flag. |

Clients log the active config hash via the telemetry `remote_config_active` event and re-evaluate Sentry/crash handlers whenever remote overrides change.

## Scrubbing Rules
- Remove email addresses and user identifiers before emitting analytics events.
- Strip precise geolocation (`contexts.geo`, GPS payloads) from error envelopes.
- Truncate stack traces to the last 50 frames to avoid leaking local file paths.
- Default sampling rate: 20% (`Math.random() < 0.2` / `Random.nextDouble() < 0.2`).
- Reject events entirely when consent or remote toggles disable analytics/crash reporting.

## Environment Flags
- `SENTRY_DSN_MOBILE`: DSN for Android/iOS builds. Leave unset to disable Sentry initialization.
- `SENTRY_DSN_WEB` (exposed via `VITE_SENTRY_DSN_WEB`): Browser SDK DSN.
- `ANALYTICS_ENABLED`: Optional bootstrap guard. When `false`, analytics stay disabled even if a user previously opted-in.

Ensure environment values are propagated through CI/CD secrets. Use Remote Config for fast kill-switch behavior without forcing redeployments.
