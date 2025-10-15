# Edge Device Benchmark QA Bench

The QA bench provides a gated workflow for running end-to-end inference timing on device builds. It is designed for
validation only and has no impact on production behaviour.

## Mobile QA Bench

1. Enable QA mode (same gate as the QA HUD) via the `QA_HUD=1` env variable or remote config flag.
2. In the Expo shell, switch to the **QA Bench** tab.
3. Choose the runtime parameters:
   - Runtime: `tflite`, `coreml`, `onnx`, `ncnn`
   - Input size: `320`, `384`, `416`
   - Quantisation: `int8`, `fp16`, `fp32`
   - Threads: `1`, `2`, `4`
   - Delegate: `cpu`, `nnapi`, `gpu` (filtered per platform)
4. Press **Run benchmark**. The runner warms up for 10 frames and then captures up to 100 measured frames (or 10 seconds)
   across detect → track → pose. Latency statistics (avg/p50/p95), FPS, memory delta, battery and thermal notes are
   recorded.
5. Results are written to `bench_run.json` in the app document directory. Use **Upload** to send the JSON payload to the
   server.

If the expected model artifact is not present inside the app sandbox the screen clearly indicates *dry mode* and emits
synthetic numbers so CI does not fail. Drop your QA models into the Expo document directory (e.g. using `expo-file-system`
`uploadAsync`) before running a real measurement.

## Models and Binary Safety

No model binaries are tracked in git. The QA bench looks for model manifests inside the Expo document directory (e.g.
`<Documents>/models/edge/manifest.json`). If nothing is found it falls back to synthetic timings. QA engineers can stage
models on device or download them at runtime during manual verification.

## Uploading Results

Uploads target `POST /bench/edge`. The payload includes device metadata and the selected runtime parameters. API key
handling matches the rest of the QA tooling (reusing `EXPO_PUBLIC_API_KEY` / `QA_HUD_API_KEY` when provided).

Server-side runs are appended to `data/bench/edge_runs.jsonl` for later aggregation.

## Aggregation and Auto-Recommend

Use `scripts/edge_recommend.py` to build platform defaults from recent runs:

```bash
python scripts/edge_recommend.py --runs data/bench/edge_runs.jsonl --output models/edge_defaults.json
```

The script groups runs by `{runtime, inputSize, quant, threads, delegate}` and scores them by median p95 latency, then
median FPS, then battery impact. The best config per platform is emitted to `models/edge_defaults.json`.

The server exposes `GET /bench/summary`, which runs the same aggregation and returns the JSON summary (and refreshes the
text file).

## Mobile Defaults Reader

Mobile shared code provides a helper to read `models/edge_defaults.json`. When the file is present (for example after
running the aggregator) the QA bench screen pre-fills the selectors with the recommended defaults for the current
platform. Production initialisation paths remain untouched.

## Applying defaults in app

The QA apps now call `GET /bench/summary` via `shared/edge/defaults.ts`. The helper fetches the summary, stores it under
`edge.defaults.v1` in AsyncStorage (with an in-memory cache) and returns per-platform defaults with sensible fallbacks if
the server cannot be reached.

`QABenchScreen` reads those cached values on mount to prefill runtime, input size, quantisation, thread and delegate
selectors. When the fetch completes the selectors update again with the latest recommendation, while still allowing QA
engineers to override any field.

An optional remote-config flag (`edge.defaults.enforce`) can call the same helper during runtime initialisation. The
flag is disabled by default, keeping production behaviour unchanged until the gate is explicitly enabled.
