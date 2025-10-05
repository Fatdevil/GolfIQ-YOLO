# Mobile beta pipelines

The `Mobile Beta Pipelines` workflow wires our iOS TestFlight and Android Play Store internal testing deployments behind a single manual trigger.

## Prerequisites

1. **Repository secrets**
   - `APP_STORE_ISSUER_ID`, `APP_STORE_KEY_ID`, `APP_STORE_PRIVATE_KEY`
   - `IOS_SCHEME` (optional override), `IOS_CONFIGURATION` (optional override)
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (preferred) or `ANDROID_SERVICE_ACCOUNT_JSON`
   - `ANDROID_PACKAGE_NAME`
   - Optional knobs: `ANDROID_PLAY_TRACK`, `ANDROID_RELEASE_STATUS`, `ANDROID_DEFAULT_LOCALE`, `ANDROID_ROLLOUT`, `TESTFLIGHT_EXTERNAL`, `TESTFLIGHT_SKIP_WAIT`, `APP_STORE_KEY_DURATION`
2. **Release notes** – populate `docs/RELEASE_NOTES_v1.2.md`. The automation falls back to a generic changelog when the file is absent.
3. **Signing assets** – ensure the Xcode project and Gradle project reference checked-in signing settings (certificates/profiles via automatic signing, Android keystore via encrypted CI variables).

## One-click run

1. Navigate to **Actions → Mobile Beta Pipelines**.
2. Click **Run workflow** to trigger both the iOS and Android jobs.
3. Monitor the TestFlight upload and Play Console internal release from the job logs.

Each lane uses cached dependencies (`bundle install`, Gradle caches) to keep reruns fast. Release notes are injected automatically and surface in the job summary for quick verification.

## Rollback tips

- **iOS** – Expire the faulty build in App Store Connect TestFlight, then re-run the workflow with the previous commit tagged and updated release notes.
- **Android** – Use the Play Console to promote a previously uploaded internal release back to testers or roll back via `manage releases → internal testing → view history`.
- Update `docs/RELEASE_NOTES_v1.2.md` to communicate the rollback status to testers before re-triggering the workflow.
