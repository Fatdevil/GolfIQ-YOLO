# Edge rollout gate

The edge runtime now uses a remote-config backed rollout gate that allows gradual enablement of the shared edge defaults, monitors health automatically, and exposes a kill switch for immediate rollback.

## Remote config keys

The following remote-config keys control the rollout behaviour. All keys live in the flat RC map (e.g. `RC['edge.rollout.enabled']`). Default values are shown in parentheses.

| Key | Description |
| --- | --- |
| `edge.rollout.enabled` (`false`) | Master switch that allows percent-based rollout when set to true. |
| `edge.rollout.percent` (`0`) | Target percentage for enforcement. Values are clamped to `0…100` and evaluated per-device. |
| `edge.rollout.kill` (`false`) | Immediate kill switch. When true, no clients enforce defaults regardless of any other setting. |
| `edge.rollout.guard.p95_latency_ms` (`130`) | Guardrail threshold used by the health endpoint to detect latency regressions. |
| `edge.rollout.guard.fps_min` (`28`) | Guardrail threshold for minimum average FPS during enforced sessions. |
| `edge.model.pinnedId` | Optional hard override for the model selection (existing behaviour, unchanged). |

## Bucketing & rollout evaluation

`shared/edge/rollout.ts` exposes two helpers for deterministic bucketing:

- `hashToBucket(deviceId)` uses a fast FNV-1a hash to assign each device ID to a bucket in the range `0…99`.
- `inRollout(deviceId, percent)` returns true when the device falls within the rollout percentage (after clamping `percent` to `0…100`).

`evaluateEdgeRollout` wraps these helpers and combines them with the remote config values and the legacy `edge.defaults.enforce` flag. The decision object contains:

- `enforced`: true when the device should apply the cached defaults (respecting the kill switch and percent rollout).
- `percent`, `kill`, `bucket`, `deviceId`: diagnostic data sent to telemetry.

## Runtime integration & telemetry

`maybeEnforceEdgeDefaultsInRuntime` now accepts optional rollout overrides (`deviceId`, async resolver, RC snapshot, and an `onEvaluated` callback). The runtime:

1. Resolves a stable device ID (either provided or via the optional resolver, falling back to `unknown-device`).
2. Evaluates the rollout decision using the rules above.
3. Invokes the `onEvaluated` callback with `{ enforced, percent, kill, bucket, deviceId }` so the session-start telemetry can include:

```json
{ "rollout": { "enforced": true, "percent": 25, "kill": false } }
```

4. Applies the cached edge defaults only when `enforced` is true. The kill switch always wins, even when the explicit `edge.defaults.enforce` flag is set.

## Health monitoring endpoint

`GET /rollout/health?since=24h` summarises the last 24 hours of HUD/flight-recorder telemetry (the window is configurable via the `since` query parameter — ISO timestamps are also accepted). The response shape is:

```json
{
  "since": "2025-02-01T06:00:00+00:00",
  "android": {
    "control": { "p95Latency": 110.0, "fpsAvg": 31.0 },
    "enforced": { "p95Latency": 150.0, "fpsAvg": 25.0 },
    "breach": true
  },
  "ios": {
    "control": { "p95Latency": 95.0, "fpsAvg": 33.0 },
    "enforced": { "p95Latency": 98.0, "fpsAvg": 29.5 },
    "breach": false
  }
}
```

A breach is flagged when any enforced cohort exceeds `edge.rollout.guard.p95_latency_ms` or drops below `edge.rollout.guard.fps_min`.

## Scheduled daily report

`.github/workflows/rollout-health.yml` fetches the health endpoint every day at 06:00 UTC and posts (or appends) a markdown table to the GitHub issue titled **Edge rollout health**. Configure the endpoint URL via the `ROLLOUT_HEALTH_URL` secret or repository variable (defaults to `http://localhost:8000/rollout/health?since=24h`). If a breach is detected the comment is prefixed with a red warning.

## Rollout playbook

1. **Prepare telemetry** – verify session start events include the `rollout` tag in QA builds.
2. **Baseline (0%)** – keep `edge.rollout.enabled=false` or `percent=0` and confirm kill switch is off.
3. **Enable gate** – set `edge.rollout.enabled=true`, leave `percent=0`, verify control telemetry and health report stay green.
4. **Ramp** – increase `edge.rollout.percent` gradually (suggested steps: 5% → 25% → 50% → 100%) while monitoring the daily report and ad-hoc dashboards. At each step:
   - Wait for at least one full health report cycle.
   - Confirm no breaches and telemetry split looks reasonable.
5. **Lock in** – once stable at 100%, keep the kill switch ready for emergencies.

## Rollback checklist

- Flip `edge.rollout.kill=true` to instantly disable enforcement (clients stop applying defaults and report `enforced=false`).
- Optionally revert `edge.rollout.enabled=false` and reset `edge.rollout.percent=0` for clarity.
- Validate telemetry shows `rollout.enforced=false` and the health report returns to green.
- Investigate the regression before re-enabling the rollout.
