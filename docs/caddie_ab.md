# Caddie A/B rollout & health digest

## Remote config toggles

QA overlay and HUD builds read feature gates from the global remote config (`globalThis.RC`).
The helper at `shared/caddie/rc.ts` exposes rollout toggles for Monte Carlo, advice, and TTS,
and applies deterministic bucketing via `shared/caddie/rollout.ts`.

| Feature | Enable key | Percent key | Kill key | Default |
| --- | --- | --- | --- | --- |
| Monte Carlo planning | `caddie.mc.enabled` | `caddie.mc.percent` | `caddie.mc.kill` | disabled (0%) |
| Coach advice cards | `caddie.advice.enabled` | `caddie.advice.percent` | `caddie.advice.kill` | enabled (100%) |
| Text-to-speech tips | `caddie.tts.enabled` | `caddie.tts.percent` | `caddie.tts.kill` | disabled (0%) |

Set `caddie.digest.enabled=false` to suppress daily digests entirely (defaults to `true`).

Percent values are clamped to whole numbers between `0` and `100`. `hashToBucket(deviceId)`
implements an FNV-1a hash that maps the stable device identifier into a bucket `0‥99`; a
device participates when `hash < percent` and the feature is enabled and not killed. The
kill flag forces the feature off regardless of `enabled/percent` so we can quickly roll back.

Recommended rollout cadence: `0% → 10% → 25% → 50% → 100%`. Update the RC service (or inject
`globalThis.RC`) and verify QA overlay sessions emit `hud.caddie.rollout` telemetry with the
evaluated booleans, percents, and kill state for traceability.

## Daily health digest

The FastAPI endpoint `/caddie/health` aggregates the last 24 hours of uploaded HUD telemetry
(`data/runs/hud/*.jsonl`). The handler reports Monte Carlo usage/adoption, average hazard &
fairway rates, leading advice copy, and TTS utilisation. A/B telemetry is broken out into
`control` vs `enforced` cohorts (plans/adopts/SG per round) with deltas for adopt/play rate
and strokes-gained lift.

GitHub Actions runs `.github/workflows/caddie-health.yml` every day at 06:15 UTC. The workflow
`curl`s the health endpoint (using `secrets.CADDIE_HEALTH_URL`/`vars.CADDIE_HEALTH_URL` when
present) and posts a comment to the “Caddie Health Digest” issue. The comment contains:

- A control/enforced table for MC/Advice/TTS showing adopt/play rate and SG/round, plus delta.
- The historical sparkline table for hazard/fairway/error metrics.
- Top advice strings and average TTS payload length.

Use the A/B table to confirm lift before bumping percentages. Large positive SG deltas justify
graduating to the next cohort size; negative deltas or regression in control suggest pausing or
using the kill switch until we investigate.
