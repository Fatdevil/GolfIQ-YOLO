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
   to landing. It also reports a quick club-difference note such as “1 club short”.

Use the **LEFT/RIGHT** hazard callouts as before – they continue to update from the pin and
do not interfere with the planner loop.

To try another shot, recompute or adjust the planner inputs, tap **Hit**, and repeat the
landing capture.
