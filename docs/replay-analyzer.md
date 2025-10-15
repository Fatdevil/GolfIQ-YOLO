# Replay Analyzer (M6 Builder)

The replay analyzer is a gated QA tool that lives in the web dashboard under `/qa/replay` when the build runs in `vite` dev
mode or when `VITE_QA_MODE=true` is supplied. It renders charts for the exported HUD telemetry (`hud_run.json`) and
compares the collected metrics against the current edge bench recommendations.

## Loading runs

There are two supported ingest paths:

1. **Drag & drop** the exported `hud_run.json` onto the upload card.
2. **Fetch by run id** — paste a `run_id` that already lives in the `/runs` API and press **Load**. The analyzer will pull the
   `events` array from the record and derive the same data as the local export.

The parser accepts the JSON array emitted by the QA HUD capture pipeline. Each entry is expected to look like:

```jsonc
{
  "timestampMs": 1700000123456,
  "event": "hud.frame",
  "data": {
    "t": 1700000123456,
    "fps": 58.4,
    "latencyMs": 22.5,
    "headingRaw": 128.3,
    "headingSmoothed": 128.1,
    "rms": 0.62,
    "state": "TRACK"
  }
}
```

Recognised events:

- `hud.session.start` — seeds metadata (session id, device, app version).
- `hud.frame` — per-frame metrics and the active HUD state.
- `hud.recenter` — timestamps re-centre requests and records how long they took.
- `hud.session.end` — captures aggregated averages generated on-device.

All timestamps are normalised to the session start time so that charts share the same horizontal axis.

## Charts and timeline

The analyzer renders:

- **Run timeline** — a banded view of the HUD state machine (`AIM`, `CALIBRATE`, `TRACK`, `RECENTER`). Re-centre windows are
  shaded for quick scanning.
- **Frame rate chart** — FPS samples per frame with the re-centre overlays.
- **Latency chart** — end-to-end latency in milliseconds (p95 summary shown in the header).
- **Heading RMS** — residual error reported by the heading smoother.
- **Heading trace** — the smoothed heading series (falls back to raw if smoothing is absent).

## Bench comparison

`GET /bench/summary` provides the most recent platform recommendations. The analyzer fetches the JSON automatically and
shows the runtime/input/quant/thread/delegate tuple per platform. Paste a `bench_run.json` into the **Compare a bench run**
panel to inspect a single synthetic run: the tool extracts FPS/latency/battery deltas and highlights the recommended
configuration for the detected platform.

## Markdown export

Use **Export report** to download a Markdown summary that contains:

- Session metadata (device, OS, duration).
- Average FPS, latency p95, and RMS mean.
- Re-centre counts with average and max duration.
- A table with the current bench defaults.

The file is written without server round-trips to keep the workflow fast and binary-safe.

## Troubleshooting

- **No timeline** — the HUD run did not record any `hud.frame` events with a recognised state. Capture again and ensure the QA
  HUD session is active.
- **Bench summary missing** — confirm the API key grants access to `/bench/summary`. Paste a stored JSON if the backend is
  offline.
- **Bad JSON** — the uploader validates the payload and surfaces parse errors inline. Ensure the export is not truncated.
