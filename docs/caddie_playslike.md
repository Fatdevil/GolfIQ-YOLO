# Caddie "Plays-Like" v1

The v1 "plays-like" calculator provides a deterministic multiplier that adjusts the flat, line-of-sight yardage for three coaching factors:

- **Elevation** — uphill lies play longer, downhill shorter.
- **Ambient temperature** — warmer air is less dense, so the ball flies farther.
- **Wind** — headwinds add effective distance, tailwinds subtract it.

The engine lives in [`shared/caddie/playslike.ts`](../shared/caddie/playslike.ts) and only depends on pure math helpers from [`shared/caddie/geometry.ts`](../shared/caddie/geometry.ts). It accepts a `PlaysLikeInput` object (raw distance, elevation delta, temperature, heading, and optional wind vector) and returns a `PlaysLikeResult` that includes the multiplier, adjusted distance, per-factor breakdown, and resolved headwind component.

## Default coefficients

The coefficients are exported constants so that future calibration tools can reuse them without hard-coding values:

- `DEFAULT_PLAYS_LIKE_COEFFS.elev_per_m = +0.007` (up to ±20 m of elevation).
- `DEFAULT_PLAYS_LIKE_COEFFS.temp_per_C = -0.002` (vs. a 15 °C reference point).
- `DEFAULT_PLAYS_LIKE_COEFFS.wind_head_per_mps = +0.020`.
- `DEFAULT_PLAYS_LIKE_COEFFS.wind_tail_per_mps = -0.015`.
- `DEFAULT_PLAYS_LIKE_CLAMP = { minFactor: 0.85, maxFactor: 1.20 }`.

The factor is computed as:

```
factor = 1
       + clamp(elevDiff_m, ±20) * elev_per_m
       + (temp_C - 15) * temp_per_C
       + windContribution
```

where `windContribution` projects the supplied wind vector onto the shot heading (positive headwind, negative tailwind) and applies the appropriate head/tail coefficient. The final multiplier is clamped to the configured `[minFactor, maxFactor]` range before multiplying the raw distance.

## Examples

- 150 m shot, +10 m uphill, calm at 15 °C → `factor ≈ 1 + 10 * 0.007 = 1.07` ⇒ ~160.5 m.
- Same shot, but ambient 25 °C (warmer by 10 °C) → `temp` term = `10 * (-0.002) = -0.02`, so `factor ≈ 1.05` ⇒ ~157.5 m.
- Add a 5 m/s headwind aligned with the shot → `wind` term = `+5 * 0.020 = +0.10`, `factor ≈ 1.15` ⇒ ~172.5 m.

These scenarios are codified in `tests/shared/caddie/playslike.spec.ts` to keep the implementation deterministic.

## Tournament-safe behavior

The QA AR HUD only surfaces the plays-like breakdown when tournament-safe gating allows it (after a hole is completed or when the tournament-safe flag is disabled). Live tournament play hides the row entirely until those conditions are satisfied so that coaching insights never leak mid-hole.

Remember: plays-like is a coaching heuristic, not an official rules measurement.
