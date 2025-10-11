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

The effective distance is `playsLike = D + slopeM + windM`.

## Temperature & Altitude

### Heuristics

- Reference temperature is 20 °C. The temperature adjustment follows `ΔD_temp = D × β_T × (20 − T_C)`
  where `β_T = 0.0018 / °C` (≈ ±1% per 10 °F). Colder air (`T < 20 °C`) increases carry
  distance, warmer air reduces it.
- Altitude uses absolute elevation above sea level only (independent of local slope):
  `ΔD_alt = D × γ_alt × (alt_m / 100)` with `γ_alt = 0.0065` (≈ +2% carry per 1000 ft).
- Each component is clamped to ±10 % of baseline distance by default; the combined
  temperature+altitude delta is capped at ±20 %.
- Missing or malformed measurements resolve to zero contribution.

Example adjustments (baseline 150 m, defaults):

- Ambient 10 °C (`≈ 50 °F`): `ΔD_temp ≈ +2.7 m`.
- Ambient 30 °C (`≈ 86 °F`): `ΔD_temp ≈ −2.7 m`.
- Altitude 1000 ft (`≈ 305 m`): `ΔD_alt ≈ +3.0 m`.

### Configuration & precedence

Remote config exposes `playsLike.tempAlt`:

```json
"tempAlt": {
  "enabled": false,
  "betaPerC": 0.0018,
  "gammaPer100m": 0.0065,
  "caps": {
    "perComponent": 0.10,
    "total": 0.20
  }
}
```

Precedence (highest first): request overrides → user/session metadata → course/hole
metadata → remote config → environment variables → code defaults. Environment overrides
follow the prefix `PLAYS_LIKE_TEMPALT_*` (e.g. `PLAYS_LIKE_TEMPALT_GAMMA_PER_100M`).

Request override headers:

- `x-pl-temp`: temperature `10C`, `50F`, etc.
- `x-pl-alt`: altitude `150m`, `500ft`, etc.
- `x-pl-tempalt`: `on|off|true|false|1|0` master switch.

Equivalent query parameters are supported via `pl_temp`, `pl_alt`, and `pl_tempalt` for
instrumentation/QA tooling.

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
  "sidewindDistanceAdjust": false
}
```

`playsLikeEnabled` remains `false` by default. Clients merge the defaults with any
per-tier overrides before computing plays-like distances.
