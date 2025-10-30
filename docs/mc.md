# Monte Carlo Engine v1.5

The caddie planner uses a Monte Carlo (MC) sampler to evaluate candidate aims for tee
shots and approaches. Version 1.5 extends the sampler with richer geometry support and
structured telemetry for health monitoring.

## Inputs

`runMonteCarloV1_5` consumes the following parameters:

| Name | Description |
| --- | --- |
| `range_m` | Target carry distance in metres. |
| `aimOffset_m` | Planned lateral aim offset relative to the target line (m, left negative). |
| `wind.cross` / `wind.head` | Cross and head/tail wind components in m/s. |
| `sigmaLong_m` / `sigmaLat_m` | Dispersion sigmas (1σ) for longitudinal and lateral noise. |
| `hazards` | Optional array of polygons with penalties. |
| `greenTargets` | Optional array of target polygons (supports section priority). |
| `samples` | Number of samples (default 2,000, clamped 64–20,000). |

Deterministic drift equals the sum of `aimOffset_m` and wind drift. Long and lateral
misses are sampled from independent Gaussian distributions.

## Scoring

Each sample contributes:

* Hazard penalty if the landing point intersects any hazard polygon.
* A success token when the landing point falls inside the highest-priority target polygon.
* Distance to the pin for EV calculations.

Aggregated metrics:

* `hazardRate` – fraction of samples that hit a hazard.
* `successRate` – fraction of samples inside a target polygon.
* `expectedDistanceToPin` – mean Euclidean distance from landing point to pin.
* `ev` – expected value computed as `-penalty + successWeight*successRate - distWeight*distance`.
  * Defaults: `hazardPenalty = 1.0`, `successWeight = 0.85`, `distWeight = 0.0125`.
* `expectedLat_m` / `expectedLong_m` – absolute means of landing positions.
* `expectedLatMiss_m` / `expectedLongMiss_m` – signed miss relative to the pin.

The sampler also surfaces deterministic drift (`driftLat_m`, `driftLong_m`), hazard and
target breakdown counts, plus the top contributing reasons ordered by severity. These
reasons feed the HUD tooltip and health telemetry.

## Strategy Integration

`planTeeShotMC` and `planApproachMC` evaluate each candidate with MC when enabled. The
planner ranks candidates by EV, applies a risk clamp using `RC.riskMax`, and exposes the
winning plan with:

* `risk` – MC hazard rate.
* `ev` – EV from the sampler.
* `riskFactors` – the top one or two formatted reasons.
* `mc` – the full MC summary for telemetry.

Risk gating prefers the highest-EV candidate whose hazard rate is at or below
`RC.riskMax`; if none qualify the highest-EV candidate wins.

### Tunables

* `RC.riskMax` – max tolerated hazard rate (0–1). Defaults to 0.42 if not provided.
* `samples` – optional override per-shot (bounded 64–20,000).

## Telemetry

HUD telemetry emits structured payloads:

```
{
  "samples": 1600,
  "hazardRate": 0.18,
  "successRate": 0.64,
  "ev": 0.35,
  "expectedDistanceToPin_m": 68.4,
  "expectedLatMiss_m": -1.2,
  "expectedLongMiss_m": 0.6,
  "hazardBreakdown": { "right-water": 180 },
  "targetBreakdown": { "green": 1020 },
  "reasons": [ { "kind": "hazard", "label": "Hazard right 18%", "value": 0.18 } ],
  "riskFactors": ["Hazard right 18%"],
  "kind": "tee"
}
```

Server-side health aggregates hazard rate overall and per shot type, success rate,
expected misses, and computes an EV lift between enforced and control cohorts.
