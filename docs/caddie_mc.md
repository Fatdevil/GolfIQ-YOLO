# Monte-Carlo caddie planning

The Monte-Carlo layer augments the deterministic tee and approach planners with
sampled landing distributions that combine player dispersion, wind drift and
course geometry. Each candidate plan (club, carry distance and aim) is evaluated
by sampling normally distributed long and lateral errors, adjusting for wind and
checking whether the resulting impacts land in fairway, green or hazard polygons
from the current bundle.

## Simulation loop

- Seeded Mulberry32 PRNG → Box–Muller Gaussians for long/lat noise
- Apply wind head/tail and cross components to shift the sample mean
- Convert the sample to course-aligned (x, y) coordinates
- Record hits inside fairway/green/hazard polygons and accumulate average miss
  distances
- Compute a score proxy: `2·pHazard + 0.6·(1−pFairway) + 0.2·|Δlong|/range +
  0.2·|Δlat|/range`
- Pick the plan with the lowest score (tie-break on `pFairway`, then distance
  fit)

## Performance budget

- Default 800 samples (UI slider 200–1200)
- Typical runtime ≈ 30–50 ms on mid-tier devices at 800 samples
- Evaluates the top 3–5 deterministic candidates only to stay within the frame
  budget

## Limitations

- Polygon membership uses a flat frame around the current shot; elevation and
  roll-out are ignored
- Wind adjustments are first-order heuristics (no trajectory solver)
- Hazards without polygons (e.g. tall rough) are not modelled
- Seed derivation is deterministic but based on shot parameters, not full
  round/shot IDs

## Reading the HUD bars

When Monte-Carlo mode is active, the caddie panel shows:

- **Fairway** bar: probability of the ball finishing inside any fairway corridor
- **Hazard** bar: chance of finding a penalty area/bunker at impact
- **Green** bar (approach only): likelihood of holding the green surface
- **Exp miss (Long/Lat)**: signed average miss distances (positive = long/right)

Exp miss is measured relative to the aim line.

Use these to judge trade-offs between safety and aggression before applying the
suggested plan to the HUD.
