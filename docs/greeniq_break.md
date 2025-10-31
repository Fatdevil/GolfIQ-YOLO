# GreenIQ Break Hint v1.3

GreenIQ v1.3 introduces a deterministic break + tempo helper that stays fully client-side. The TypeScript-only engine keeps the AR HUD tournament-safe while offering a short coach-style nudge once the hole is complete.

## Hint engine

`shared/greeniq/break.ts` exposes a pure `breakHint` function:

- Inputs: putt length (meters), signed start-line angle (degrees), pace ratio (`endDist ÷ holeDist`), optional slope grade (%), optional stimp value, and optional coefficient overrides.
- Aim magnitude uses
  \[
  \text{aim} = \operatorname{clamp}(|\theta|·L·c_{deg} + |s|·L^2·c_{slope}, 0, c_{max}) · \frac{10}{\text{stimp}}
  \]
  with defaults `c_deg = 1.2 cm/(deg·m)`, `c_{slope} = 0.35 cm/(%·m²)`, `c_{max} = 60 cm`. Missing slope simply removes the slope term and sets confidence to `low`.
- Aim side derives from the signed angle (values within ±0.05° collapse to `center`).
- Tempo buckets use configurable soft/firm thresholds (default 0.85/1.20 pace ratio) to suggest `firmer`, `softer`, or `good`.
- Confidence tiers: `high` for putts ≥3 m with slope data, `med` for 1.5–3 m, otherwise `low`.
- All math is NaN-safe and never mutates external state.

A helper in `shared/greeniq/stimp.ts` (`stimpFactor`) normalizes the stimp adjustment (`10 ÷ stimp`) and reuses the v0 estimator defaults.

## HUD wiring

`golfiq/app/src/screens/QAArHudOverlayScreen.tsx` surfaces the hint once the hole is complete and the standard visibility helper allows feedback. A compact line appears under the existing GreenIQ metrics, e.g.

```
Hint (High): Aim 12 cm left · +8% tempo
```

Behavioural notes:

- The copy shrinks to “Aim slightly left/right” when the magnitude is unknown and “Aim center” for neutral reads.
- Tempo text mirrors the coach voice: `+X% tempo`, `−X% tempo`, or `Tempo good`.
- A QA-only “Hints” switch sits beside the existing override toggle. It is forced off for tournament-safe runs and respects the current visibility rules.

## Telemetry

`shared/telemetry/greeniq.ts` now exports `emitGreenIqBreakTelemetry`. The HUD emits a single `greeniq.break.v1` event per putt when hints are enabled, carrying:

- `length_m`, `angleDeg`, `paceRatio`
- Optional `slope_pct`, `stimp`
- Output `aimCm`, `aimSide`, `tempoHint`, `confidence`

Emission is opt-in—callers must pass `{ enabled: true }`.

## Testing

`tests/shared/greeniq/break.spec.ts` exercises all branches (aim side, slope/no slope, stimp clamping, invalid input handling, coefficient overrides) to keep the hint engine at 100 % coverage. Run `npm run test:unit` to verify.
