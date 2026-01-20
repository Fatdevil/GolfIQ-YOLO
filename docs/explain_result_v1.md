# Explain Result V1

A compact, user-facing explanation payload attached to analysis metrics.

## Payload example

```json
{
  "version": "v1",
  "confidence": {
    "score": 68,
    "label": "MED"
  },
  "why_may_be_wrong": [
    {
      "id": "fps_low",
      "title": "Low frame rate",
      "detail": "Low FPS can miss the ball after impact."
    },
    {
      "id": "blur_high",
      "title": "Too much blur",
      "detail": "Motion blur hides the ball in flight."
    }
  ],
  "what_to_do_now": [
    {
      "id": "increase_fps",
      "title": "Increase frame rate",
      "detail": "Enable slow-mo capture (120–240 FPS)."
    },
    {
      "id": "reduce_blur",
      "title": "Reduce blur",
      "detail": "Stabilize the phone or use faster shutter."
    }
  ],
  "debug": {
    "signals_used": ["fps_low", "blur_high"],
    "inputs_present": {
      "range_mode_hud": true,
      "calibration": true,
      "guardrails": true
    }
  }
}
```

## Confidence labels

- **HIGH (>= 75):** capture conditions are solid; results are likely reliable.
- **MED (45–74):** usable, but one or more issues could affect accuracy.
- **LOW (< 45):** results are likely unreliable; address capture issues first.

## Supported reasons and actions

| Issue id | Why it may be wrong | What to do now |
| --- | --- | --- |
| `fps_low` | Low frame rate | Increase frame rate (slow-mo 120–240 FPS) |
| `blur_high` | Too much blur | Stabilize the phone or use faster shutter |
| `exposure_too_dark` | Too dark | Add lighting on the hitting area |
| `exposure_too_bright` | Too bright | Reduce exposure or avoid glare |
| `framing_unstable` | Ball drifting out of frame | Center the ball and keep it in view |
| `ball_lost_early` | Ball lost early | Start recording earlier |
| `calibration_fit_r2_low` | Calibration fit is weak | Recalibrate scale |
| `calibration_fit_rmse_high` | Calibration error is high | Recalibrate scale |
| `calibration_low_confidence` | Calibration confidence low | Re-run calibration with clearer tracking |
| `capture_warning` | Capture needs attention | Improve capture setup |
| `capture_blocked` | Capture blocked | Fix capture quality before recording |

When no issues are present, the response keeps `why_may_be_wrong` empty and returns a positive action like `record_swing`.
