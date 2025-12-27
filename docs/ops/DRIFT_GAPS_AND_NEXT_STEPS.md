# Drift gaps and next steps

## Resolved gaps (staging hardening)
- Added a `/ready` probe that validates writable data dirs, feature flag store access, and S3 presign capability before reporting ready.
- Startup now fails fast in staging/prod if critical secrets are missing (API keys, admin token, live signing keys).
- Container defaults are safer (SERVE_WEB off by default) with explicit data/config volumes for runs, uploads, rounds, bags, and feature flags.

## Open items
- Monitor `/ready` failures in staging to catch S3 or filesystem regressions early.
- Add dashboards/alerts for readiness and live signing failures once staging metrics are available.
