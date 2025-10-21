# Beta RC builds

This document explains how to grab unsigned release artifacts from CI, install them locally, and where to find the in-app diagnostics tools that ship with the beta channel.

## Downloading artifacts from GitHub Actions

### Android
1. Open the **Actions** tab in GitHub and run (or select) the **android-release** workflow.
2. After the run completes, download the artifact named **android-app-release-unsigned**.
3. The artifact contains `app-release-unsigned.apk` together with the generated `shared/app/version.json` manifest for the build.

### iOS (simulator archive dry-run)
1. Trigger the **ios-build** workflow from the **Actions** tab.
2. When the job finishes, download the **ios-build-logs** artifact. It contains `build/xcodebuild.log` alongside the archive path that Xcode generated (simulator-only, no signing).

> iOS builds run in archive dry-run mode against `iphonesimulator` so that no signing credentials are required. Use the recorded commands to reproduce a local archive when needed.

## Installing the Android APK locally

1. Unzip the artifact bundle and locate `app-release-unsigned.apk`.
2. Ensure a device or emulator is available via `adb devices`.
3. Install (or update) the build:
   ```bash
   adb install --replace app-release-unsigned.apk
   ```
4. Launch the GolfIQ beta app from the device launcher.

## About & Diagnostics screen

The beta build exposes a new **About** tab in the mobile app navigation. Open it to review build metadata and QA state:

- **Version**: Semver, build number, git SHA, and build timestamp injected during CI.
- **Platform & device**: Current runtime info and device identifiers used for rollout bucketing.
- **Rollout & edge runtime**: Shows cohort percent, enforcement state, pinned model ID, and tuned edge defaults.
- **Bag & tuning**: Highlights whether a personalized bag or tuned coefficients are active.
- **RC snippet**: Lists key remote-config overrides currently applied on device.
- **Upload queue & logs**: Summaries for pending telemetry uploads and the last 10 minutes of reliability events.
- **Privacy & Data**: Links to documentation and a QA-only toggle to disable telemetry sampling temporarily.

### Diagnostics actions

- **Export logs** posts a zipped JSON bundle (version manifest, diagnostics snapshot, and recent logs) to the `/issues` endpoint used by ops. The resulting issue ID is shown after a successful upload.
- **Copy diagnostics** copies the same JSON snapshot to the clipboard for quick sharing.

Use these actions while testing RC builds to attach context to bug reports or rollout investigations.
