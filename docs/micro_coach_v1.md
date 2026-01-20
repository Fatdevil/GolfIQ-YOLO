# MicroCoach v1

MicroCoach v1 converts `explain_result` signals into short, coach-voice capture tips. It is intentionally limited to capture-quality fixes (lighting, FPS, steadiness, framing, calibration) and never provides swing mechanics advice.

## Payload Example

```json
{
  "version": "v1",
  "enabled": true,
  "tips": [
    {
      "id": "tip_fps_light",
      "title": "Mer ljus för högre FPS",
      "detail": "Öka belysningen så kameran kan köra snabbare bildhastighet.",
      "priority": 1,
      "source": {
        "reason_ids": ["fps_low"],
        "action_ids": ["increase_fps"],
        "hud_flags": ["fps_low"],
        "confidence_label": "MED"
      }
    }
  ],
  "debug": {
    "inputs_present": {
      "explain_result": true,
      "range_mode_hud": true,
      "calibration": true
    },
    "selected_rule_ids": ["tip_fps_light"],
    "deduped_tip_ids": ["tip_fps_light"]
  }
}
```

## Gating Rules

MicroCoach is **enabled** only when:

1. `explain_result` exists **and** includes `confidence.label`, **and**
2. one of the following is true:
   - `confidence.label` is not `LOW`, or
   - `confidence.label` is `LOW` **and** `range_mode_hud.state` is `ready` or `warn` **and** at least one actionable tip triggers, or
   - `confidence.label` is `LOW` **and** `range_mode_hud.state` is `block` **and** at least one capture-quality tip triggers.

If `confidence.label` is `LOW` and the state is `block`, MicroCoach only returns capture-quality tips (lighting/FPS/steadiness/framing).

## Supported Tip IDs & Triggers

| Tip ID | Title | Triggered by reason/action/hud IDs |
| --- | --- | --- |
| `tip_fps_light` | Mer ljus för högre FPS | `fps_low`, `increase_fps` |
| `tip_stabilize_phone` | Stabilisera kameran | `blur_high`, `reduce_blur` |
| `tip_keep_ball_in_frame` | Håll bollbanan i bild | `framing_unstable`, `framing`, `framing_bad`, `improve_framing` |
| `tip_capture_block` | Fixa fångsten först | `capture_blocked`, `fix_capture` |
| `tip_even_lighting` | Jämnare ljus | `exposure_too_dark`, `exposure_low`, `exposure`, `improve_lighting` |
| `tip_reduce_glare` | Undvik motljus | `exposure_too_bright`, `exposure_high`, `reduce_glare` |
| `tip_start_earlier` | Starta lite tidigare | `ball_lost_early`, `start_earlier` |
| `tip_capture_setup` | Vässa inspelningen | `capture_warning`, `improve_setup` |
| `tip_redo_calibration` | Gör om kalibreringen | `calibration_fit_r2_low`, `calibration_fit_rmse_high`, `calibration_low_confidence`, `recalibrate_scale` |

MicroCoach deduplicates tips by `id`, then selects the top `max_tips` by `priority`, using `id` as a deterministic tie-breaker.
