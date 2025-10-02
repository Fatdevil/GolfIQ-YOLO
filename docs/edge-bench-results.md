# Edge Bench Results Aggregation

This repository ships a helper script that turns recorded telemetry from the
`edge-bench` suite into a lightweight scoreboard. The tool parses JSONL flight
recorder files, averages the common metrics per unique device profile, and
publishes both CSV and Markdown scoreboards so the results can be consumed by
humans as well as scripts.

## Running the Aggregation

1. Ensure you have Python 3.11+ available.
2. Collect or copy the flight-recorder JSONL files into one directory. By
   default, the script looks in `var/flight`, but you can point it to another
   location with the `FLIGHT_RECORDER_DIR` environment variable or the
   `--input` command line argument.
3. Run the aggregation:

   ```bash
   python tools/bench_aggregate.py
   ```

   This will read every `*.jsonl` file in the input directory (recursively),
   filter the events tagged with `"suite": "edge-bench"`, and generate the
   following artefacts under `reports/`:

   * `edge_bench.csv` – machine-readable scoreboard for scripting or dashboards.
   * `edge_bench.md` – Markdown summary with a "winner" table per OS platform.

   To override the output directory:

   ```bash
   python tools/bench_aggregate.py --output out/reports
   ```

## Example Output

Below is an excerpt of what the generated Markdown report can look like when
fed with sample data:

```
# Edge Bench Scoreboard

Generated on 2025-01-17T12:42:11+00:00.

## Winners by Platform

| Device | OS | Runtime | Input Res | Quant | Samples | FPS Avg | Latency P50 (ms) | Latency P95 (ms) | Cold Start (ms) | Battery Drop 15m (%) |
|---|---|---|---|---|---|---|---|---|---|---|
| Pixel 8 Pro | Android 14 | MediaPipe 0.10 | 1280x720 | int8 | 6 | 52.40 | 21.10 | 28.30 | 158.00 | 2.10 |
| iPhone 15 Pro | iOS 17 | CoreML 3.0 | 1920x1080 | fp16 | 5 | 58.20 | 18.40 | 24.90 | 142.00 | 1.40 |

## Full Results

| Device | OS | Runtime | Input Res | Quant | Samples | FPS Avg | Latency P50 (ms) | Latency P95 (ms) | Cold Start (ms) | Battery Drop 15m (%) |
|---|---|---|---|---|---|---|---|---|---|---|
| Pixel 8 Pro | Android 14 | MediaPipe 0.10 | 1280x720 | int8 | 6 | 52.40 | 21.10 | 28.30 | 158.00 | 2.10 |
| Pixel 8 Pro | Android 14 | MediaPipe 0.10 | 1920x1080 | int8 | 4 | 44.90 | 24.80 | 33.00 | 166.00 | 2.60 |
| Quest 3 | Android 13 | VulkanNN 2.2 | 2048x2048 | fp16 | 3 | 37.50 | 30.40 | 43.20 | 221.00 | 3.90 |
| iPhone 15 Pro | iOS 17 | CoreML 3.0 | 1920x1080 | fp16 | 5 | 58.20 | 18.40 | 24.90 | 142.00 | 1.40 |
| iPad Pro M4 | iPadOS 17 | CoreML 3.0 | 2732x2048 | fp16 | 2 | 48.70 | 22.60 | 29.80 | 161.00 | 1.90 |
```

Use the CSV for dashboards or ingesting into spreadsheets, and the Markdown file
for quick sharing in docs or chats.
