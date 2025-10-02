# BenchRunner iOS Benchmark Harness

BenchRunner is a lightweight iOS app that exercises a bundled CoreML model against a deterministic sequence of synthetic test fram
es and reports timing, battery, and thermal metrics to the shared telemetry endpoint.

## Project Layout

```
ios/BenchRunner/
├── BenchRunner.xcodeproj
├── BenchRunner/
│   ├── App/                  # Swift sources and benchmark orchestration
│   ├── Assets.xcassets/      # App icon
│   ├── Frames/               # Placeholder folder (frames generated from embedded base64)
│   ├── Models/               # Placeholder folder (model materialized from embedded base64)
│   └── Info.plist
└── bench-README.md
```

## Build & Run

1. Open `ios/BenchRunner/BenchRunner.xcodeproj` in Xcode 15 or newer.
2. Select the `BenchRunner` scheme and your target device (real hardware recommended for thermal/battery metrics).
3. Ensure the device is unplugged from power for realistic battery readings and enable Low Power Mode if desired.
4. Run the app. The benchmark starts automatically on launch and will display live status plus a summary once finished.

### Runtime configuration

You can override default timings through environment variables or launch arguments:

| Key | Default | Description |
| --- | --- | --- |
| `BENCH_WARMUP_FRAMES` | `45` | Number of warm-up frames before metrics are recorded. |
| `BENCH_MEASURE_SECONDS` | `60` | Duration of the primary measurement loop (seconds). |
| `BENCH_EXTENDED_MINUTES` | _unset_ | Optional extended run duration in minutes (defaults to 15 when set to a positive number). |
| `BENCH_ENABLE_EXTENDED` | _unset_ | Set to `1` to force a 15 minute extended pass. |
| `BENCH_FRAME_COUNT` | `150` | Number of frames generated for each loop iteration. |
| `BENCH_TELEMETRY_URL` | `http://localhost:8000/telemetry` | Override telemetry POST endpoint. |
| `BENCH_USE_TFLITE` | _unset_ | Set to `1` or pass `--use-tflite` as a launch argument to attempt the optional TensorFlow Lite path (falls back to CoreML when the interpreter is unavailable). |

### Telemetry payload

BenchRunner POSTs a JSON body to `BENCH_TELEMETRY_URL` (default `http://localhost:8000/telemetry`) after each run. The schema ma
tches the Android benchmarking harness:

```json
{
  "platform": "ios",
  "metrics": {
    "model_id": "GradientIdentity",
    "run_id": "<UUID>",
    "timestamp": "2024-10-02T20:30:00Z",
    "frames_processed": 1800,
    "warmup_frames": 45,
    "fps_avg": 29.8,
    "fps_min": 28.1,
    "fps_max": 31.4,
    "latency_p50_ms": 34.2,
    "latency_p95_ms": 38.5,
    "cold_start_ms": 215.7,
    "model_file_mb": 0.00,
    "battery_drop_pct_15m": 2.1,
    "thermal_state": "fair",
    "device_model": "iPhone15,3",
    "os_version": "17.0",
    "backend": "coreml",
    "telemetry_post_url": "http://localhost:8000/telemetry"
  }
}
```

The optional `battery_drop_pct_15m` will be absent when an extended loop is not executed. Telemetry requests are fire-and-forget;
failures are logged to the Xcode console.

## Notes

- The default CoreML model is embedded as base64 text and materialized at runtime to avoid tracking large binaries in Git. Drop i
n your own `.mlmodel` next to `EmbeddedResources.swift` (or adjust the provider) to profile a different network.
- Frames are generated from an embedded gradient PNG to guarantee deterministic input without storing binary fixtures.
- The TensorFlow Lite backend is stubbed behind `BENCH_USE_TFLITE`; link `TensorFlowLiteC` or the official CocoaPod to activate i
t.
- No CI jobs attempt to build the iOS target; GitHub Actions workflows ignore `ios/**` changes.
