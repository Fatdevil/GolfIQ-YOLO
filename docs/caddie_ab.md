# Caddie A/B rollout & health digest

## Remote config toggles

QA overlay and HUD builds read feature gates from the global remote config (`globalThis.RC`).
The TypeScript helper at `shared/caddie/rc.ts` exposes three toggles with percentage rollouts
evaluated per-device using a deterministic hash (`shared/caddie/rollout.ts`).

| Feature | Enable key | Percent key | Default |
| --- | --- | --- | --- |
| Monte Carlo planning | `caddie.mc.enabled` | `caddie.mc.percent` | disabled (0%) |
| Coach advice cards | `caddie.advice.enabled` | `caddie.advice.percent` | enabled (100%) |
| Text-to-speech tips | `caddie.tts.enabled` | `caddie.tts.percent` | disabled (0%) |

Percent values are truncated to whole numbers between `0` and `100`. Devices hash into a
bucket `0‥99`; a device participates when `hash < percent`. To update the rollout:

1. Edit the remote config value in the RC service (or inject `globalThis.RC` while testing).
2. Set `*.enabled=true` and the desired `*.percent` (for example `25` for a quarter of devices).
3. QA overlay sessions emit `hud.caddie.rollout` telemetry containing the evaluated flags and
   configured percents for auditability.

## Daily health digest

The FastAPI endpoint `/caddie/health` aggregates the last 24 hours of uploaded HUD telemetry
(`data/runs/hud/*.jsonl`). The handler reports Monte Carlo usage/adoption, average hazard &
fairway rates, leading advice copy, and TTS utilisation.

GitHub Actions runs `.github/workflows/caddie-health.yml` every day at 06:15 UTC. The workflow
`curl`s the health endpoint (using `secrets.CADDIE_HEALTH_URL`/`vars.CADDIE_HEALTH_URL` when
present) and posts a comment to the “Caddie Health Digest” issue. The comment includes a small
sparkline table for adoption %, hazard/fairway probabilities, and average error. Review that
issue to monitor adoption before changing rollout percentages.
