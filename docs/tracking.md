# AR-HUD Ground Calibration

This guide covers the two-point ground calibration workflow that powers the AR-HUD ball tracking pipeline.

## When to calibrate

* Run the wizard before your first AR-HUD session and whenever the device position moves more than a few metres.
* Saved calibrations expire after 14 days. The HUD will surface a nudge and mark health as “Poor” once the snapshot is too old.

## Two-point wizard

1. Launch the QA AR-HUD overlay and tap the “Calibrate” button in the HUD status card.
2. **Step 1** – tap a ground point roughly 2–3 m from the phone and enter the straight-line distance (metres).
3. **Step 2** – tap a second point further down-range (aim for at least a 3 m spread) and enter its distance.
4. Review the summary card. If health is acceptable, tap **Done** to persist the homography snapshot. Use **Retake** to capture again.

### Best practices

* Pick points on flat, unobstructed ground along the intended ball flight line.
* Aim for at least 3–4 m between points; longer baselines produce more stable homographies.
* Avoid nearly horizontal alignments—keep the points stacked vertically in frame.
* Re-run the wizard any time you reposition the device or see a “Poor” chip in the HUD.

## Calibration health

Health is derived from the stored homography metadata:

| Health | Rule of thumb |
| ------ | ------------- |
| **Good** | Baseline ≥ 3 m and baseline angle within 15° of vertical. |
| **OK** | Meets minimum geometry but baseline < 3 m or the angle is between 15° and 50° off vertical. |
| **Poor** | Baseline < 0.75 m, the angle is > 50° from vertical, or the snapshot is missing/expired. |

The HUD status chip mirrors this evaluation so operators can identify when recalibration is required.
