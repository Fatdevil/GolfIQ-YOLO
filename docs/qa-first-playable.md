# QA Planner → Hit → Result loop

The QA AR HUD overlay now includes a lightweight first-playable workflow so we can test
plays-like adjustments directly on device. This flow is QA-gated and has no impact on the
production experience.

## Launching the planner

1. From the QA launcher, open **Overlay → AR HUD**.
2. Select a course bundle (refresh if needed) and drop a pin using **Set Pin**.
3. Expand the **Planner** panel inside the pin tools card.

The planner shows the current baseline distance to the selected pin. Use the steppers to
adjust conditions:

- **Temp (°C)** – air temperature at the player. Defaults to 20 °C.
- **Altitude (m ASL)** – absolute altitude of the player. Defaults to sea level.
- **Wind (m/s)** and **From (°)** – wind speed and meteorological bearing. When wind
  blows directly from the pin the bearing equals the target azimuth.
- **Slope Δh (m)** – relative elevation change from player to pin. Positive is uphill.

Press **Compute** to combine the existing temperature/altitude and wind/slope modules.
The panel reports the resulting plays-like distance, a component breakdown, and a simple
club suggestion based on the default QA bag.

## Running a shot loop

1. After computing, tap **Hit** to start a shot session. This snapshots the current plan
   and records the start point.
2. Once the ball lands, tap **Mark landing** and then tap on the mini map to drop the
   landing marker. (The map will highlight when it is ready to record a landing point.)
3. The result card compares planned plays-like distance vs. the measured carry from start
   to landing. It now includes smart feedback that highlights the top contributing deltas,
   shows club usage vs. the planner recommendation, and suggests the next club or crosswind
   aim tweak.

## Smart feedback

- The headline summarizes the miss in metres and approximates it in club steps using the
  effective QA bag.
- The detail lines explain the largest temperature/altitude, wind, and slope deltas, note
  which club was actually hit vs. suggested, and outline the next-shot adjustment.
- When personal tuning is active a small **TUNED** badge appears next to the headline so
  testers can confirm the personalized coefficients were applied.

Telemetry (QA only) now emits `hud.feedback` with the signed error distance, the estimated
club delta, the reported top factors, the recommended next club, and whether tuning was
engaged.

Use the **LEFT/RIGHT** hazard callouts as before – they continue to update from the pin and
do not interfere with the planner loop.

To try another shot, recompute or adjust the planner inputs, tap **Hit**, and repeat the
landing capture.

## Auto-landing (QA only)

After tapping **Hit**, the overlay now runs a conservative landing detector in the
background. When your device speed drops below roughly 0.8 m/s for at least three seconds
and GPS accuracy is 12 m or better, the HUD proposes a landing point. Candidates are
debounced by 12 m so the banner only appears when you have truly stopped near a new
location.

- The banner reads `Auto landing: 142 m` and offers **Accept**, **Adjust**, or **✕**.
- **Accept** immediately marks the landing using the snapped point (snaps to the nearest
  bundle edge within 8 m when possible) and logs the carry distance.
- **Adjust** arms the manual workflow so you can fine-tune the landing on the mini map.
- **✕** dismisses the current suggestion while keeping the detector armed for a new
  candidate.

If no valid proposal is found within 60 s after tapping **Hit**, the detector quietly
cancels and you can continue with manual marking.

## Calibrate bag

The QA overlay can learn a personal carry map from recent sessions without touching
production defaults. Expand **Calibrate bag** in the pin tools card to reveal two actions:

1. **Use last session** parses the `hud_run.json` shot log from the current device. Each
   club needs at least five qualifying shots before a suggestion is emitted. Carries are
   filtered with a robust 2.5 × MAD window around the per-club median so single outliers do
   not skew the result.
2. Review the table comparing the default QA bag with the suggested medians and the shot
   counts that supported them. When satisfied, tap **Save as my bag** to persist the personal
   bag locally (QA only). Future planner suggestions will automatically pull from this saved
   bag.

If no qualifying shots exist the table remains unchanged and the module reports the
requirement so you can gather more swings.


## Round Mode (QA only)

1. Enable QA mode via the launcher or set `QA_ROUND=1` in the Metro environment. A new **Round Mode** panel becomes available alongside the QA tools.
2. Pick a course (the tool will auto-suggest the nearest bundle) and choose a tee preset. Tap **Start round** to create a new session or resume the persisted round.
3. The hole view shows par, running score, and the shot log. Use **Open HUD overlay** to launch the AR HUD planner and record shots; every shot recorded in the overlay automatically syncs into the active hole.
4. Use **+ Stroke** or enter a specific value with **Set score** to track the hole. Navigate with **Previous/Next** and tap **Finish round** on the final hole to lock in the summary.
5. The summary view reports total score vs. par, FIR/GIR heuristics, and allows exporting the session as `round_run.json` for replay analysis.
