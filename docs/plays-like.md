# Plays-like Distance (Slope + Wind)

The plays-like distance combines the raw pin distance with adjustments for elevation
(slope) and wind alignment to provide a more representative yardage. The logic is
shared across Android, iOS, and web via `shared/playslike/PlaysLikeService`.

## Formulas

Given:

- `D` — baseline target distance in metres.
- `Δh` — elevation delta (target altitude minus player altitude) in metres.
- `w‖` — wind component parallel to the target line in m/s (positive = headwind).

### Slope (all models)

Slope keeps a 1:1 relationship with elevation: `slopeM = clamp(slopeFactor, 0.2, 3.0) * Δh`
with `slopeFactor = 1.0` by default.

### Wind (percent_v1)

The default wind model, `percent_v1`, converts the aligned wind speed to miles per
hour and applies a percentage-based distance delta:

1. Convert to mph: `W_mph = |w‖| * 2.237`.
2. Headwinds use `alphaHead_per_mph = +0.01` (+1% distance per mph). Tailwinds use
   `alphaTail_per_mph = +0.005` but subtract from the total (−0.5% per mph).
3. Speeds above `taperStart_mph = 20` taper: the portion above the threshold is
   multiplied by `0.8` before applying the percentage.
4. The total percentage change is clamped to `±windCap_pctOfD = ±0.20` of `D`.
5. The wind adjustment is `windM = D * pct` where `pct` is the signed percentage
   after tapering and capping.

The effective distance adds any enabled environmental adjustments:
`playsLike = D + slopeM + windM + tempM + altM`.

### Temperature (RC-gated)

When `playsLike.temperatureEnabled` is `true` the service adds a temperature
delta using `betaTemp_per_C` (default `0.0018`). Given ambient temperature `T_C`
in °C:

```
tempM = clamp(D * betaTemp_per_C * (20 - T_C), ±0.05 * D)
```

The effect is capped to ±5% of the baseline distance.

### Altitude (RC-gated)

When `playsLike.altitudeEnabled` is `true` the service adds an altitude delta
using `gammaAlt_per_100m` (default `0.0065`). Given absolute altitude above sea
level `h_asl_m` in metres:

```
altM = clamp(D * gammaAlt_per_100m * (h_asl_m / 100), ±0.15 * D)
```

The effect is capped to ±15% of the baseline distance.

## Quality bands

Quality is derived from the raw inputs:

- `low` if `D ≤ 0` or both `Δh` and `w‖` are missing.
- `warn` when `|Δh| > 15 m` **or** `|W_mph| > 12` mph.
- `good` otherwise.

These thresholds map to green / amber / red badges in the HUD and web UI.

## Telemetry

Every evaluation posts the following payload to `/telemetry` with event
`plays_like_eval`:

```json
{
  "event": "plays_like_eval",
  "D": <baseline distance>,
  "deltaH": <Δh>,
  "wParallel_mps": <w‖>,
  "T_C": <ambient temperature °C>,
  "h_asl_m": <altitude metres ASL>,
  "model": "percent_v1",
  "params": {
    "alphaHead_per_mph": 0.01,
    "alphaTail_per_mph": 0.005,
    "slopeFactor": 1.0,
    "windCap_pctOfD": 0.20,
    "taperStart_mph": 20
  },
  "eff": <playsLike>,
  "slopeM": <slope adjustment>,
  "windM": <wind adjustment>,
  "deltaTempM": <temperature adjustment>,
  "deltaAltM": <altitude adjustment>,
  "quality": "good|warn|low"
}
```

No personally identifiable data is transmitted.

## Remote configuration

Remote config exposes a `playsLike` block for each tier:

```json
"playsLike": {
  "windModel": "percent_v1",
  "alphaHead_per_mph": 0.01,
  "alphaTail_per_mph": 0.005,
  "slopeFactor": 1.0,
  "windCap_pctOfD": 0.20,
  "taperStart_mph": 20,
  "sidewindDistanceAdjust": false,
  "temperatureEnabled": false,
  "betaTemp_per_C": 0.0018,
  "altitudeEnabled": false,
  "gammaAlt_per_100m": 0.0065
}
```

`playsLikeEnabled` remains `false` by default. Clients merge the defaults with any
per-tier overrides before computing plays-like distances.

## Temperature & altitude (QA)

- Remote config keys gate both adjustments and expose their gains.
- Web QA drawer surfaces the raw temperature (`T_C`) and sea-level altitude
  (`h_asl_m`) alongside their respective deltas when enabled.
- Defaults keep both features disabled to avoid breaking changes.
