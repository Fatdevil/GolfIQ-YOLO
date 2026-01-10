# Field Test Mode

Field Test Mode adds an operator-focused HUD overlay that surfaces QA metrics, one-tap telemetry markers, and a guided nine-hole ritual helper. Use it during on-course validation to capture lightweight traces without attaching a laptop.

## Enabling the overlay

1. Ensure the latest mobile build is running on the test device (iOS or Android).
2. Open the HUD settings surface.
3. Toggle **Field test mode**. The toggle honours remote config defaults; if the backend pushes an override it will appear after the next config refresh.
4. Once enabled you will see a compact "Field QA" panel in the top-right corner of the HUD. The same toggle is available on both platforms.

Remote config exposes a boolean key `fieldTestMode`. Keep it `false` in production builds unless QA is scheduled.

## HUD quick reference

The Field QA panel shows:

- **FPS** – real-time render rate (updates ~2× per second).
- **Latency bucket** – derived from the device profile's expected pipeline latency (e.g. `<40ms`, `66-99ms`).
- **Tracking mode** – whether the HUD is currently operating in Geospatial or Compass fallback.
- **ETag age** – number of days since the active remote config hash was applied; `<1d` indicates a fresh pull.
- **Hole & recenter counts** – live counters driven by the nine-hole helper.

Buttons available from the panel:

- **Mark** – opens a quick sheet for tee, approach, putt, re-center, or bundle refresh markers.
- **Start 9-hole / Next hole / End run** – controls for the ritual helper.

## Nine-hole ritual checklist

1. **Start the run** as you step onto the first tee. The HUD records the start marker and resets counters.
2. For each hole:
   - Capture tee, approach, and putt with the Mark sheet.
   - Use the regular HUD *Re-center* control whenever anchors drift; the helper automatically increments the recenter counter and emits a telemetry marker.
   - Tap **Next hole** before moving to the next tee. The helper tracks progress up to nine holes.
3. **End run** after finishing hole nine (or earlier if you need to abort). The HUD posts a summary with holes played, recenter count, average FPS, and battery delta.

If a bundle refresh is triggered, use the Mark sheet option to tag it. Manual bundle refreshes from settings also emit a telemetry marker automatically.

## KPIs to watch

During field sessions monitor:

- **FPS stability** – aim for ≥30 FPS on Tier A devices; investigate dips captured in the average FPS summary.
- **Pipeline latency bucket** – ensure the device stays inside the expected bucket for its tier.
- **Remote config freshness** – if the ETag age grows beyond a week, verify that the config service is reachable.
- **Recentering frequency** – excessive re-centers (more than 2 per hole) hint at tracking or sensor drift.
- **Battery delta** – large drops (>12% per 9-hole run) may need runtime adjustments.

## Ops dashboard

Operators can review captured summaries in the web console under **Field runs**. Each run lists aggregate metrics alongside the ordered marker timeline to help correlate HUD performance with on-course events.

## Range Mode capture settings (recommended)
- **Frame rate:** target ≥60 FPS (30 FPS minimum).
- **Exposure:** lock exposure/focus when possible; avoid over/under-exposed frames.
- **Stability:** use a tripod or fixed mount to reduce blur.
- **Framing:** keep the full ball flight path in frame and avoid zoom changes mid-shot.
