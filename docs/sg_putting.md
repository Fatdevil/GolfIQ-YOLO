# Putting Strokes Gained

This note documents the deterministic putting strokes-gained (SG) engine used by the QA AR HUD overlay. Everything lives in TypeScript so we can audit the math, unit-test it, and eventually swap in field-calibrated data without touching native code.

## Baseline curve

The baseline \(E(d)\) reports the expected strokes to hole out from a starting distance \(d\) (metres). We model \(E\) as a monotone cubic spline constrained to the on-green domain \([0, 20]\) metres. The spline is defined by the following control points:

| Distance (m) | Expected strokes |
| ------------ | ---------------- |
| 0.0 | 0.00 |
| 0.3 | 1.00 |
| 0.6 | 1.05 |
| 0.9 | 1.10 |
| 1.2 | 1.17 |
| 1.5 | 1.24 |
| 1.8 | 1.34 |
| 2.4 | 1.50 |
| 3.0 | 1.68 |
| 3.6 | 1.86 |
| 4.5 | 2.05 |
| 6.0 | 2.28 |
| 7.5 | 2.48 |
| 9.0 | 2.64 |
| 12.0 | 2.92 |
| 15.0 | 3.18 |
| 20.0 | 3.55 |

`shared/sg/baseline.ts` sanitises these anchors, enforces monotonicity, and exposes the helper `loadDefaultPuttingBaseline()`. The same file exports `DEFAULT_PUTTING_BASELINE_POINTS`, so replacing the table with empirical data is a configuration change rather than a refactor.

## Formula

Per putt the SG delta is

\[
\mathrm{SG}_i = E(d_i) - 1 - E(d_{i+1})
\]

where:

- \(d_i\) is the distance before the putt,
- \(d_{i+1}\) is the distance of the next putt (zero once the ball is holed), and
- the `1` represents the stroke that was just taken.

`shared/sg/putting.ts` validates the sequence, applies the baseline, and returns both the total SG and a per-putt breakdown so UI can surface concise summaries.

## Worked examples

1. **Single putt** – Start at 2.0 m and hole the putt.
   - \(E(2.0) = 1.3956\)
   - \(E(0) = 0\)
   - \(\mathrm{SG} = 1.3956 - 1 - 0 = +0.3956\)

2. **Two putts** – First putt from 3.5 m to 0.8 m, second putt holed.
   - Putt 1: \(E(3.5) = 1.8331\), \(E(0.8) = 1.0792\) → \(\mathrm{SG}_1 = -0.2461\)
   - Putt 2: \(E(0.8) = 1.0792\), \(E(0) = 0\) → \(\mathrm{SG}_2 = +0.0792\)
   - Hole total: \(-0.1669\) strokes gained vs baseline

The negative hole total in the second example reflects leaving a long second putt after the first attempt.

## Limitations and notes

- Inputs are clamped to 0–20 m; longer “putts” should be handled as short-game shots.
- The model is deterministic—no weather, green speed, or player-specific adjustments.
- Invalid sequences (non-decreasing distances, missing holed flag) raise `InvalidPuttSequenceError` so tests can assert on error handling. Production callers should catch this and fall back to a zero card.
- The helpers only depend on TypeScript files under `shared/`; no runtime server changes are required.

For integration details see `shared/sg/putting.ts` (pure calculations) and `golfiq/app/src/screens/QAArHudOverlayScreen.tsx` (HUD presentation).
