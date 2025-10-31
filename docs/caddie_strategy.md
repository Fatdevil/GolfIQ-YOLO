# Caddie Strategy v1

The v1 shot strategy engine combines plays-like distance adjustments with Monte Carlo hazard
metrics to recommend an aim lane and target carry for three deterministic risk profiles:
Conservative, Neutral, and Aggressive. The scorer runs entirely in TypeScript and relies on the
existing plays-like, geometry, and MC v1.5 modules.

## Expected Value Model

For each candidate target lane the engine evaluates a simple expected value (EV):

```
EV = distanceReward - hazardPenalty + fairwayBonus - biasPenalty
```

* **distanceReward** – meters of along-target gain relative to the plays-like carry, scaled by the
  profile’s `distanceReward` weight. Targets closer to the plays-like distance score higher.
* **hazardPenalty** – weighted sum of MC hazard probabilities (`water`, `bunker`, `rough`, `ob`).
* **fairwayBonus** – reward proportional to the MC fairway probability.
* **biasPenalty** – penalty applied when the aim is inside the profile’s `fatSideBias_m` buffer on
  the danger side. This encourages aiming away from dominant hazards (fat-side bias).

All probabilities are clamped to `[0, 1]` and NaN-safe sanitizers keep the scorer deterministic.

## Risk Profiles

Default weights live in `shared/caddie/strategy_profiles.ts`:

| Profile       | Water | Bunker | Rough | OB  | Fairway | Distance | Fat-side bias (m) |
|---------------|-------|--------|-------|-----|---------|----------|-------------------|
| Conservative  | 1.60  | 0.80   | 0.60  | 2.20 | 0.45   | 0.0008   | 8 |
| Neutral       | 1.20  | 0.60   | 0.45  | 1.60 | 0.35   | 0.0010   | 5 |
| Aggressive    | 0.85  | 0.40   | 0.30  | 1.10 | 0.25   | 0.0015   | 3 |

Conservative profiles strongly penalise hazards and require the largest fat-side buffer. Aggressive
profiles tolerate more risk and reward longer carries.

## Deterministic Grid Sampling

`chooseStrategy()` evaluates a fixed grid of offsets `{-12, -8, -4, 0, +4, +8, +12}` meters and carry
adjustments `{-10, 0, +10}` meters around the plays-like distance. Candidates are clamped to the
provided bounds (`minCarry`, `maxCarry`, `maxOffset`) and filtered to unique combinations. The best
EV wins with deterministic tie-breakers (smaller absolute offset, then carry closest to target).

## Fat-side Bias

The engine determines a dominant hazard side from MC rates (or an explicit override) and requires a
minimum `fatSideBias_m` buffer in that direction. Any candidate that fails to clear the buffer
receives an extra penalty that scales with hazard severity and lateral dispersion, nudging the aim
further toward the fat side.

## Future Work

This is an intentionally lightweight heuristic for QA tooling. Future revisions may consider
continuous optimisation, richer MC feature sets, or dynamic grids that respond to course geometry
and player-specific shot patterns.
