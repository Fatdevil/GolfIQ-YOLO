# AR-HUD QA Mode

The AR-HUD QA surface is a gated React Native screen that wires the shared HUD
state machine to lightweight native shims for sensors, camera cadence, and
telemetry. It is intended for engineering and QA validation; the feature is not
available in production builds unless explicitly enabled.

## Enabling the QA HUD

The QA HUD is shown when at least one of the following is true:

- Remote config flag `qa.hud.enabled` is set to `true`.
- Environment variable `QA_HUD=1` (or `true` / `yes`) is present at build time.
- The app is running in a development (`__DEV__`) build.

When the gate is open a **QA HUD** tab appears in the Expo shell next to the
existing QA views.

## Live metrics

The QA screen renders the HUD state machine state and the derived metrics that
are required to pass QA:

| Metric | Source | Threshold |
| ------ | ------ | --------- |
| FPS | synthetic camera stub + frame budget tracker | ≥ 30 FPS |
| Latency | camera stub latency budget | ≤ 120 ms |
| Heading RMS | heading smoother residual | ≤ 1.0° |
| Re-center time | camera stub recenter promise | ≤ 2.0 s |

Badges change color (green vs. amber) when a metric crosses its threshold to
highlight regressions during a run. The log panel keeps the five most recent
state changes and export messages.

## Telemetry capture

Starting a QA session opens the existing `/telemetry` flight-recorder channel
and begins writing `hud.session.*`, `hud.frame`, and `hud.recenter` events. A
mirrored copy of every event is saved locally to `hud_run.json` inside the Expo
Document directory (JSON array). Stopping the session records
`hud.session.end` with basic aggregates and flushes the JSON file.

## Exporting `hud_run.json`

Select **Export** on the QA screen to POST the captured file to the `/runs`
API. The client requests an upload slot via `/runs/upload-url` and uses the
returned target (filesystem or S3) to transfer `hud_run.json`. Provide an API
key via `EXPO_PUBLIC_API_KEY` (or `QA_HUD_API_KEY`) when running outside the
secured QA network.

If the device is offline the export button reports an error in the log panel;
retry once connectivity is restored.
