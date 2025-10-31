# Strokes Gained Engine (Approach + Short Game)

This document captures the deterministic baseline set that powers our v1 approach and short-game
strokes gained (SG) engine. The implementation lives entirely in TypeScript under `shared/sg`.

## Method Overview

* **Baselines** – `loadDefaultBaselines()` returns a `BaselineSet` with smooth, monotone
  expectations for each lie (`tee`, `fairway`, `rough`, `sand`, `recovery`, dedicated `short-game`,
  and `green`). The functions clamp their inputs, treat non-finite numbers as zero distance, and
  interpolate linearly between documented anchor points. `expStrokesFromDistance` routes distances
  to the putting curve ≤ 20 m, the short-game curve for 20–35 m off-green shots, and the fairway
  (approach) curve beyond 35 m.
* **Per-shot SG** – For each shot event we evaluate the baseline at the start lie/distance and at
  the subsequent lie/distance. SG for the stroke is `E_start - 1 - E_next` (the final stroke uses
  `0` for the next expectation when the ball is holed).
* **Phases** – `classifyPhase` maps each shot to one of four phases:
  * Tee – `startLie === 'tee'`
  * Putting – `startLie === 'green'`
  * Short Game – `start_m <= 35` metres and lie in `{fairway, rough, sand, recovery}`
  * Approach – everything else
* **Aggregation** – `holeSG` validates the shot ordering, computes SG per stroke, tags the phase,
  and sums the contribution per phase plus the hole total. Invalid sequences return zeroed
  results marked with an internal flag for diagnostics.

## Default Baseline Points

The multi-lie baselines are expressed as monotone anchor points (metres → expected strokes). A few
representative samples:

| Distance (m) | Tee | Fairway | Rough | Sand | Recovery |
| ------------ | ---:| -------:| -----:| ----:| --------:|
| 5            | 2.00 | 2.05 | 2.15 | 2.25 | 2.45 |
| 35           | 2.55 | 2.60 | 2.80 | 2.95 | 3.20 |
| 150          | 3.30 | 3.35 | 3.55 | 3.70 | 4.15 |
| 250          | 3.90 | 3.95 | 4.20 | 4.35 | 4.95 |
| 400          | 4.80 | 4.85 | 5.10 | 5.25 | 6.15 |
| 600          | 5.65 | 5.70 | 5.95 | 6.10 | 7.20 |

Putting expectations reuse the established monotone Hermite baseline that already powers the
GreenIQ experience (0–20 m input domain).

## Shot Event Validation

`holeSG` expects a sequence of `ShotEvent` records:

```ts
{
  start_m: number;   // start distance to the hole in metres
  end_m: number;     // next start distance (0 when holed)
  startLie: Lie;     // tee / fairway / rough / sand / recovery / green
  endLie: Lie;
  holed: boolean;    // true only for the final stroke
}
```

Validation rules:

1. Start distances must be non-increasing and non-negative.
2. Each `end_m` (unless holed) must be ≤ the stroke’s `start_m`.
3. Consecutive shots must connect (`prev.end_m` ≈ `next.start_m` within 1 m).
4. The final stroke must be flagged `holed` with `end_m === 0`.

Invalid sequences produce a zeroed response with an internal symbol flag so that tests and tools can
identify the issue without throwing at runtime.

## Examples

* **Fairway → Green (2 shots)** – 150 m fairway approach to 3 m, then a made putt.
  * Approach SG: `E_fairway(150) - 1 - E_green(3)`
  * Putting SG: `E_green(3) - 1`
  * Hole SG: sum of the two contributions.
* **Rough Chip (2 shots)** – 25 m rough chip to 1.2 m, then a holed putt.
  * Short-game SG: `E_rough(25) - 1 - E_green(1.2)`
  * Putting SG: `E_green(1.2) - 1`
* **Tee → Rough → Sand → Green (4 shots)** – 380 m tee shot to rough (90 m),
  sand blast to 2 m, holed putt.
  * Tee SG: `E_tee(380) - 1 - E_rough(90)`
  * Approach SG: `E_rough(90) - 1 - E_sand(12)`
  * Short-game SG: `E_sand(12) - 1 - E_green(2)`
  * Putting SG: `E_green(2) - 1`

## Future Adjustments

The deterministic baselines are intentionally conservative and easy to reason about. We can swap
`loadDefaultBaselines()` with field-calibrated lookup tables (e.g. percentile fit from tour
tracking) without touching the downstream consumers. Tests assert monotonicity and clamping so that
future updates remain safe.
