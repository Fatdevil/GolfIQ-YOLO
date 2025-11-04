# Caddie Strategy v1

The strategy engine picks a deterministic target lane (aim offset + carry) from a
small grid and scores each candidate with a linear expected-value model. Inputs
come from the QA HUD follow loop: raw distance, plays-like factor, Monte Carlo
lane probabilities, and player dispersion.

## EV components

For each lane we evaluate:

- **Distance reward** – penalises deviation from the plays-like carry:
  `distanceReward = -weights.distanceReward * |carry - playsLikeCarry|`.
- **Hazard penalty** – deducts the weighted water, bunker, rough, and OB
  probabilities returned by MC v1.5.
- **Fairway bonus** – awards a linear bonus for the fairway probability.
- **Fat-side bias** – if the aim is within the profile's `fatSideBias_m` buffer
  on the danger side (water/OB), subtract a fixed `0.5` to encourage aiming to
  the fat side.

The final EV is `distance + fairway - hazard - bias`. Missing or invalid
probabilities default to zero, and the scorer always returns finite numbers.

Default weights per profile are defined in
`shared/caddie/strategy_profiles.ts` so they can be tuned without touching the
algorithm.

## Candidate grid

We clamp the plays-like carry by any explicit bounds and evaluate a 7×3 grid:

- Offsets: `{-12, -8, -4, 0, +4, +8, +12}` metres, clamped to the playable
  corridor or an explicit `maxOffset_m` bound.
- Carries: `{PL-10, PL, PL+10}` metres, clamped to `[minCarry_m, maxCarry_m]`
  when provided.

The best EV wins, with deterministic tiebreaks favouring the straighter and
closer-to-PL options.

## Worked example

For a 150 m shot (plays-like factor `1.04`), lane width 28 m, danger left, and
MC probabilities `{ water: 0.18, bunker: 0.04, rough: 0.12, ob: 0.02, fairway:
0.52 }`:

- **Conservative** → `Aim +7 m R · Carry 156 m (PL +4%)`
  - Breakdown: `haz -0.33 · fw +0.31 · dist -0.48`
- **Neutral** → `Aim +5 m R · Carry 156 m (PL +4%)`
  - Breakdown: `haz -0.26 · fw +0.26 · dist -0.40`
- **Aggressive** → `Aim +3 m R · Carry 156 m (PL +4%)`
  - Breakdown: `haz -0.18 · fw +0.31 · dist -0.34`

(Values are illustrative; the engine is deterministic and will reproduce them
for the same inputs.)

## Tournament-safe gating

The QA HUD only exposes the “Strategy” row when a session is not marked as
`tournamentSafe` or once the hole is complete. This mirrors the existing
plays-like and caddie gating – no pre-shot advice appears during
`tournament-safe` play.
