# Replay Analyzer (M6 Builder)

The replay analyzer is a gated QA tool that lives in the web dashboard under `/qa/replay` when the build runs in `vite` dev
mode or when `VITE_QA_MODE=true` is supplied. It renders charts for the exported HUD telemetry (`hud_run.json`) and
compares the collected metrics against the current edge bench recommendations.

## Loading runs

There are two supported ingest paths:

1. **Drag & drop** the exported `hud_run.json` onto the upload card.
2. **Fetch by run id** — paste a `run_id` that already lives in the `/runs` API and press **Load**. The analyzer will pull the
   `events` array from the record and derive the same data as the local export.

### Upload from device & open by ID

- On the QA HUD screens, use **Upload HUD run** (for telemetry) or **Upload Round** (for shot summaries). The device queues the
  JSON payload locally and retries with backoff until the server returns a share id.
- The analyzer exposes an **Open shared run** card. Paste the share id, choose the target slot, and press **Load** to fetch the
  JSON from `/runs/{id}`.
- Use **Copy share link** to grab a ready-to-share `${API_BASE}/runs/<id>` URL for teammates.

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

## Shot log & dispersion

QA overlay captures append plan vs actual shot records to `hud_run.json` under the `hud.shot` envelope. The analyzer parses
every object with a `shotId` and renders two complementary views:

- **Dispersion plot** — plots the landing point relative to the pin (origin). The Y axis runs along the target line (positive
  values = long); the X axis shows lateral error (positive values = right). Multiple runs can be overlaid, with the active
  run highlighted via the toggle above the charts.
- **Shot stats table** — compares average carry, standard deviations, and the share of short/long/left/right misses. This
  table updates as you switch between the primary/comparison runs.

Use the slot picker above the upload card to load a capture as **Primary** or **Comparison**. The timeline & FPS/latency
charts operate on the active slot while the dispersion widgets always show all loaded runs side-by-side.

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
- Shot dispersion summary (count, carry mean/std, directional bias).
- A table with the current bench defaults.

The file is written without server round-trips to keep the workflow fast and binary-safe.

## Share links

- Every successful HUD or round upload returns a share id that can be opened directly at `/share/<id>` without requiring the
  analyzer shell. The page renders the headline metrics, adds proper Open Graph tags for Slack/Teams unfurls, and exposes quick
  actions to launch the analyzer, copy the link, or download the raw JSON.
- Share pages load a binary-safe copy of the original payload straight from `/runs/{id}`. The JSON can be re-used locally or
  re-uploaded into the analyzer slots for deeper inspection.

## Troubleshooting

- **No timeline** — the HUD run did not record any `hud.frame` events with a recognised state. Capture again and ensure the QA
  HUD session is active.
- **Bench summary missing** — confirm the API key grants access to `/bench/summary`. Paste a stored JSON if the backend is
  offline.
- **Bad JSON** — the uploader validates the payload and surfaces parse errors inline. Ensure the export is not truncated.
