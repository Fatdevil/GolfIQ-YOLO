# GreenIQ Putt Feedback v1

GreenIQ v1 instruments the QA AR HUD with deterministic post-putt feedback for start-line and pace. The feature is completely client-side TypeScript so it can run in CI without touching server-side Python or native modules.

## Coordinate handling

`shared/greeniq/putt_eval.ts` exposes `evaluatePutt`, a pure helper that transforms 2D points into meter space (when a 3×3 homography matrix is supplied) and classifies the stroke:

- **Start-line**: compares the start→end vector to the start→hole vector. Angle buckets default to `on ≤ 1°`, `ok ≤ 2°`, otherwise `off`. Missing or zero-length vectors produce an `unknown` class with `0°` displayed.
- **Pace**: computes the ratio of end distance to hole distance. Ratios `< 0.85` are `too_soft`, `0.85–1.20` are `good`, `> 1.20` are `too_firm`. If the hole is not known we fall back to `unknown`.
- **Fallbacks**: If no homography is provided the function treats the coordinates as already metric, so QA map selections still work before calibration is taken.

The helper returns `angleDeg`, classifications, and optional `holeDist_m`/`endDist_m` so callers can render rich copy or emit telemetry without recomputing distances.

## HUD workflow

On QA HUD the putt workflow reuses existing data:

1. `ShotSessionState.origin` is the ball start.
2. Manual landing selection (tap on the map) provides the end vector.
3. The currently pinned hole is projected into local ENU space.
4. `evaluatePutt` runs once a landing exists for a `putt` phase shot.

A new “GreenIQ feedback” card appears in the planner/results column whenever the current session is a putt. By default the card remains hidden until the hole is completed. In non-tournament sessions QA can enable the override to preview live feedback before the hole is finished. When tournament-safe is active the override is disabled and the card only appears after the hole is complete.

Displayed copy:

- **Start-line**: e.g. `Start-line: 0.8° (ok)`
- **Pace**: e.g. `Pace: good · Tempo dialed.` or `Pace: too soft · +1-3% tempo next time`
- Optional metrics for hole/end distance in meters when both are known.

## Telemetry

When a putt evaluation is available the client optionally emits `greeniq.putt_feedback.v1` through the shared QA telemetry bridge. Payload fields:

- `angleDeg`
- `angleClass`
- `paceClass`
- `holeDist_m`
- `endDist_m`

Emission is idempotent thanks to a simple fingerprint, so we only send when the evaluation changes.

## Testing

Vitest covers `evaluatePutt` with boundary checks for angle thresholds, pace ratios, missing data, zero-length vectors, and the homography (identity) path. The suite lives in `tests/shared/greeniq/putt_eval.spec.ts` and is included in the existing `npm run test:unit` job.

