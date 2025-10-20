# QA Playbook (M4–M6)

This guide complements `CONTRIBUTING.md` with deeper QA procedures for the AR HUD milestones.

## Device readiness checklists

### Pixel 7 (Android 14)
- [ ] Battery ≥ 70% and connected to USB-C PD (avoid throttling below 15%).
- [ ] Thermal profile reset: Settings → Battery → disable Battery Saver.
- [ ] Developer options → Force GPU Rendering **off**.
- [ ] Enable USB debugging and verify `adb devices` shows the handset.
- [ ] Clear app data: `adb shell pm clear com.golfiq.app.qa`.

### iPhone 13 (iOS 17)
- [ ] Battery ≥ 60% and on MagSafe with active cooling pad if available.
- [ ] Low Power Mode disabled.
- [ ] Settings → Developer → Disable ProMotion throttling (leave frame capture enabled).
- [ ] Trust the Mac build host and confirm visibility in Xcode’s Devices window.
- [ ] Reset network settings if QA HUD streaming appears stalled.

> **Thermal note:** If the device surface exceeds 42°C, pause the run for 5 minutes. Sustained heat skews sensor drift and GPU timings.

## Run naming conventions
Use the format `M{milestone}-{feature}-{device}-{runNumber}`. Example: `M5-bench-latency-pixel7-03`.

- HUD captures: attach the `hud_run.json` to the PR and link it as `[HUD: filename](secure://hud/M5-bench-latency-pixel7-03.json)`.
- Bench runs: upload to BenchHub and add `[Bench: runId](https://bench.golfiq.dev/runs/runId)`.
- Replay exports: include the generated Markdown in the PR or link `[Replay: filename](secure://replay/M6-replay-pixel7.md)`.
- Mobile QA builds expose **Upload HUD run** and **Upload Round** buttons—trigger them to persist telemetry, then record the
  returned share id so reviewers can load it via `/qa/replay` → **Open shared run**.

When you fill in the PR template, add these links under **QA notes** so reviewers can quickly cross-reference evidence.

## Workflow reminders
1. Capture HUD first (M4) to establish baseline sensor traces.
2. Run Bench (M5) with matching `{runtime, inputSize, quant, threads, delegate}`.
3. Verify defaults (M5.1) by toggling `edge.defaults.enforce` and watching for config reload toast.
4. Use Replay (M6) to diff the HUD vs. Bench results, export the Markdown report, and attach it to the PR.
