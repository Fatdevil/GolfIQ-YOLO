# Mobile runtime adapter, device tiering, and impact audio trigger

## Runtime adapters

### Android
- Supported modes: `tflite_cpu`, `tflite_nnapi`, `tflite_gpu`, `ncnn_cpu`, `ncnn_vulkan`.
- The default mode is derived from the device profile tier (Tier A → GPU, Tier B → NNAPI, Tier C → NCNN CPU).
- Users can override the runtime at runtime in Settings; overrides persist in shared preferences.

### iOS
- Supported modes: `coreml` (default) and `tflite_ios` (fallback for low-tier devices).
- Overrides are stored in `UserDefaults` and take precedence over the profiled default runtime.

## Device tiering
- A lightweight micro-benchmark (≈8s) is executed on first launch to estimate p95 inference latency.
- FPS is derived as `1000 / p95_latency_ms` and mapped to tiers:
  - **Tier A**: ≥30 FPS — full live detection and HUD features.
  - **Tier B**: 15–30 FPS — HUD enabled with reduced input size/frequency.
  - **Tier C**: <15 FPS — record-then-analyze workflow with heavy features disabled by default.
- The resulting `DeviceProfile` (tier, estimated FPS, runtime recommendation) is cached locally and posted to `/telemetry` without PII.

## Impact audio trigger
- Android uses `AudioRecord` RMS monitoring with a -18 dB threshold and 1.2s debounce to start/stop capture for hands-free shots.
- iOS uses `AVAudioEngine` RMS monitoring with matching thresholds and debounce.
- Telemetry logs impact trigger activations for QA coverage, and a Settings toggle (`Hands-free (impact)`) is exposed via feature flags.
