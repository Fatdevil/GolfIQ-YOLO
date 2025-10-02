# Android Runtime Benchmark Harness

The `android/bench` module is a self-contained Android application that replays a
short clip of AR frames against multiple inference runtimes and ships telemetry
back to the GolfIQ backend. This harness is intentionally excluded from CI
builds; run it locally when you need device level performance data.

## Prerequisites

- Android Studio Hedgehog (AGP 8.1+, JDK 17)
- A device or emulator running Android 12 (API 31) or newer
- Models copied into `android/bench/src/main/assets/models/` (placeholders are
  checked in and should be replaced with production binaries before testing)

## Build

```bash
cd android
./gradlew :bench:assembleDebug
```

The Gradle settings file only registers the `:bench` module, so the command
above builds just the benchmark APK. Intermediate files live under
`android/bench/build/` and are ignored by git.

## Install & Run

1. Connect your target device and enable USB debugging.
2. Install the APK:

   ```bash
   cd android
   ./gradlew :bench:installDebug
   ```

3. Launch the benchmark activity via `adb` to pass runtime flags as intent
   extras:

   ```bash
   adb shell am start \
     -n com.golfiq.bench/.ui.MainActivity \
     --es runtimes "tflite_cpu,tflite_nnapi,tflite_gpu,ort_nnapi,ncnn_cpu,ncnn_vulkan" \
     --ei warmup 48 \
     --ei extendedMinutes 15
   ```

   Omitting extras runs all runtimes with default warm-up (45 frames) and a
   single 60s timed loop.

## Runtime Flags

| Extra             | Type   | Default | Notes                                        |
| ----------------- | ------ | ------- | -------------------------------------------- |
| `runtimes`        | `String` | all 6 | Comma separated runtime identifiers          |
| `warmup`          | `Int`    | 45     | Number of warm-up frames before sampling     |
| `extendedMinutes` | `Int`    | 0      | Minutes for the long battery/thermal pass    |

Runtime identifiers map to:

- `tflite_cpu`
- `tflite_nnapi`
- `tflite_gpu`
- `ort_nnapi`
- `ncnn_cpu`
- `ncnn_vulkan`

## Telemetry Payload

Telemetry is POSTed as a JSON array to `${BuildConfig.TELEMETRY_BASE_URL}/telemetry`
(defaults to `http://10.0.2.2:8080/telemetry`). Each entry follows the schema
below:

```json
{
  "runtime": "tflite_cpu",
  "status": "success",
  "metrics": {
    "fps_avg": 27.5,
    "fps_min": 22.1,
    "fps_max": 32.0,
    "latency_ms_p50": 38.0,
    "latency_ms_p95": 52.4,
    "cold_start_ms": 420,
    "model_file_mb": 25.7,
    "model_param_mb": 1.4,
    "model_bin_mb": 24.3,
    "rss_mem_mb": 310.2,
    "battery_delta_15m": -3,
    "thermal_state": 2,
    "extended_fps_avg": 25.9
  },
  "metadata": {
    "timestamp_ms": 1714000000000,
    "device": "Pixel 8 Pro",
    "api_level": 34
  }
}
```

If a runtime cannot be initialized the harness records a `status` of `skipped`
and includes an `error` field with the failure reason.

## Updating Assets

- Replace the placeholder TFLite/ONNX/NCNN model files under
  `android/bench/src/main/assets/models/` with the latest binaries.
- To update the synthetic frame sequence, drop PNGs into
  `android/bench/src/main/assets/frames/` and update `index.txt` with one file
  name per line. The harness performs letterbox/normalization internally.

## Environment Overrides

The telemetry endpoint can be overridden by exporting a Gradle property before
building:

```bash
cd android
export ORG_GRADLE_PROJECT_benchTelemetryBaseUrl="https://staging.api.golfiq.com"
./gradlew :bench:installDebug
```

This value is compiled into `BuildConfig.TELEMETRY_BASE_URL`.
