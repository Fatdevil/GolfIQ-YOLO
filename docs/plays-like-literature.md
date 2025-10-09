# Plays-Like Literature Profile (literature_v1)

The `literature_v1` profile encodes widely cited on-course adjustment rules without fitting or calibration. Guidance from Andrew Rice, Arccos, and similar published sources is consistent with the following heuristics:

- **Headwind:** add roughly **+1% carry per mph** of headwind.
- **Tailwind:** remove roughly **-0.5% carry per mph** of tailwind (tailwinds help less than headwinds hurt).
- **Slope:** maintain a **1:1 conversion between metres of elevation change and metres of effective distance**.

These rules are implemented via the existing `percent_v1` wind algorithm with conservative safety rails:

- Wind impact is capped at ±20% of the baseline distance.
- Values above 20 mph taper by 20% to avoid runaway corrections in extreme winds.
- Baseline alphas come directly from the literature (no data fitting).

## Club & Player Scaling

Different clubs and player types experience wind differently. We provide optional multipliers derived from published PGA/LPGA and coaching references:

- **Drivers** typically launch lower, so their head/tail response is reduced (`scaleHead = scaleTail = 0.9`).
- **Mid-irons** use the baseline (`1.0`).
- **Wedges** spend more time aloft, so headwind impact grows slightly (`scaleHead = 1.1`).
- **Tour players** flight the ball flatter, leading to a small reduction (`0.95`).
- **Amateurs** tend to balloon shots; a modest increase maintains realism (`head 1.05`).

You can disable scaling by setting all scale values to `1.0` (either in Remote Config or by overriding the config payload).

## Remote Config Integration

Remote Config now exposes the profile choice and the literature defaults:

```json
{
  "playsLikeProfile": "literature_v1",
  "playsLike": {
    "windModel": "percent_v1",
    "alphaHead_per_mph": 0.01,
    "alphaTail_per_mph": 0.005,
    "slopeFactor": 1.0,
    "windCap_pctOfD": 0.20,
    "taperStart_mph": 20,
    "byClub": {
      "driver": { "scaleHead": 0.9, "scaleTail": 0.9 },
      "midIron": { "scaleHead": 1.0, "scaleTail": 1.0 },
      "wedge": { "scaleHead": 1.1, "scaleTail": 1.0 }
    },
    "byPlayerType": {
      "tour": { "scaleHead": 0.95, "scaleTail": 0.95 },
      "amateur": { "scaleHead": 1.05, "scaleTail": 1.0 }
    }
  },
  "playsLikeProfileSelection": {
    "playerType": "tour",
    "clubClass": "midIron"
  }
}
```

- `playsLikeProfile` selects the rule-set (`literature_v1`).
- `playsLikeProfileSelection` lets clients request optional scaling for a default `playerType` and `clubClass`.
- Omitting the selection (or setting either field to `null`) keeps the baseline alphas.

## Validation Script

Run the non-fitting validation script to confirm the profile stays within literature bands:

```bash
python tools/playslike/validate_literature_v1.py
```

The script prints PASS/FAIL per scenario and writes `reports/playslike_literature_validation.md` with details. Update or extend `tools/playslike/validation_cases.json` if new scenarios are required.
