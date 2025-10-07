# Plays-like Distance (Slope + Wind)

The plays-like distance combines the raw pin distance with adjustments for elevation
(slope) and wind alignment to provide a more representative yardage. The logic is
shared across Android, iOS, and web via `shared/playslike/PlaysLikeService`.

## Formulas

Given:

- `D` — baseline target distance in metres.
- `Δh` — elevation delta (target altitude minus player altitude) in metres.
- `w‖` — wind component parallel to the target line in m/s (positive = headwind).
- `kS` — slope gain (default `1.0`).
- `kHW` — wind gain (default `2.5`).

The adjustments are computed as:

```
slopeM = clamp(kS, 0.2, 3.0) * Δh
windM  = clamp(kHW, 0.5, 6.0) * w‖
playsLike = D + slopeM + windM
```

All three platforms clamp gain values defensively to avoid extreme tuning.

## Quality bands

A quality badge communicates confidence in the adjustment magnitude. The score is
the sum of the absolute slope and wind adjustments relative to the baseline
distance:

```
ratio = (|slopeM| + |windM|) / max(D, ε)
```

Quality thresholds:

- `good` when `ratio ≤ 0.05`
- `warn` when `0.05 < ratio ≤ 0.12`
- `low` otherwise (or if `D ≤ 0`)

These thresholds map to green / amber / red badges in the HUD and web UI.

## Telemetry

Every evaluation posts the following payload to `/telemetry` with event
`plays_like_eval`:

```json
{
  "D": <baseline distance>,
  "deltaH": <Δh>,
  "wParallel": <w‖>,
  "eff": <playsLike>,
  "kS": <kS>,
  "kHW": <kHW>,
  "quality": "good|warn|low"
}
```

No personally identifiable data is transmitted.

## Remote configuration

The remote config surface now exposes `playsLikeEnabled` (default `false`) for all
three tiers. Clients gate UI rendering and computations on this flag.
