# GreenIQ Putt Feedback v1.2

GreenIQ v1.2 keeps the QA AR HUD logic deterministic and TypeScript-only while tightening start-line heuristics, adding a light stimp estimator, and improving the cup workflow. Everything continues to execute on the client so the feature remains CI-friendly and tournament-safe.

## Distance-aware start-line heuristics

`shared/greeniq/putt_eval.ts` exposes `evaluatePutt`. The helper now derives angular thresholds from lateral tolerances instead of fixed degrees:

- Reference distance `L_ref = 3 m` is used to back-solve the baseline lateral allowances from the legacy thresholds (`1°` → `δ_on ≈ 0.052 m`, `2°` → `δ_ok ≈ 0.105 m`).
- For each putt we compute the start→hole length `L`. The effective thresholds are
  
  \[
  \theta_{on}(L) = \arctan\left(\frac{\delta_{on}}{\max(L, 0.5)}\right), \qquad
  \theta_{ok}(L) = \arctan\left(\frac{\delta_{ok}}{\max(L, 0.5)}\right)
  \]
  
  ensuring a consistent cup-side tolerance. Extremely short putts (<0.5 m) are clamped to avoid runaway angles.
- The stroke angle is measured with `atan2` so we keep the sign (right misses are `+`, left misses are `−`). The API continues to return `angleDeg` (absolute) for backwards compatibility and now adds:
  - `signedAngleDeg`
  - `lateralMiss_cm` (actual miss at cup)
  - `aimAdjust_cm` (opposite-signed correction suggestion)
  - `angleThresholdsDeg` (the distance-aware thresholds used for the classification)

Pace heuristics are unchanged: we still bucket by the ratio of end distance to hole distance using the configurable soft/firm bounds.

## Stimp estimator v0

`shared/greeniq/stimp.ts` adds a lightweight estimator that expects three calibration putts recorded on level ground:

1. Parse the rollout distances (meters) and drop non-finite or out-of-range (<0.5 m or >20 m) samples.
2. Sort the valid values and trim the min/max to focus on the central tendency.
3. Convert the trimmed median to feet (`d_ft = d_m × 3.28084`) — this is the stimp rating.
4. Compute a `paceFactor = clamp(baseline / d_ft, 0.5, 1.5)` using a baseline of 10 ft unless overridden. Faster greens (higher stimp) produce factors <1, slower greens drift toward 1.5.

The estimator returns the stimp feet value, the pace factor, how many samples survived trimming, and the median rollout distance in meters. Tests cover the happy path, clamping, and invalid-input fallback.

## HUD updates

The QA HUD (`golfiq/app/src/screens/QAArHudOverlayScreen.tsx`) now surfaces the richer evaluation:

- Signed start-line string (`+0.4° R`, `−0.7° L`, or `±0.0°`) alongside the distance-aware thresholds.
- Explicit miss and aim-adjust copy in centimeters, rounded to one decimal when <10 cm, otherwise to the nearest centimeter.
- Telemetry includes the signed angle, lateral miss, aim adjust, and thresholds for downstream analysis.
- The map overlay displays a “Tap·hold to confirm cup” hint and defers the long-press callback until release, so operators must hold to confirm the cup location.

## QA workflow refresher

1. Capture or load the homography; `evaluatePutt` continues to accept raw local ENU coordinates when calibration is missing.
2. Mark putt landings as before — the feedback card still stays hidden until the hole is complete unless QA enables the override.
3. Long-press (tap and hold) on the map or press the Set Pin button to confirm the cup position.
4. Review the feedback card for signed angles, pace copy, and the new centimeter suggestions.

## Testing

Vitest suites cover the new heuristics:

- `tests/shared/greeniq/putt_eval.spec.ts` exercises distance-aware thresholds, signed output, and the homography path.
- `tests/shared/greeniq/stimp.spec.ts` ensures the estimator handles median trimming, clamping, and bad inputs.

`npm --prefix web run typecheck` and `npm --prefix web run test:unit` should remain green.
