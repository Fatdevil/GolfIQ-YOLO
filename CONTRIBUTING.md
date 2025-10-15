# Contributing to GolfIQ

Thanks for taking the time to improve GolfIQ! This document captures the essentials that every contributor needs to know before sending a pull request.

## Quickstart

### JavaScript / TypeScript apps
1. Install dependencies: `npm install` (root) and `npm install` within `web/` if you are touching the web client.
2. Lint: `npm run lint` from the repo root.
3. Unit tests: `npm test`.
4. Web preview: `npm run web` to launch the Vite/Expo web dev server.
5. Expo mobile preview: `npm run expo` to start the Expo dev client.

### Python services & tooling
1. Install dependencies: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt`.
2. Lint: `ruff check .` (use `--fix` locally if appropriate).
3. Type check (where supported): `mypy .`.
4. Unit tests: `pytest` (add `-k <pattern>` to scope).
5. Telemetry/ingest services: `python server_app.py --dev` or relevant entrypoint in `server/`.

> **Tip:** If you are working across both stacks, run `npm run build` before Python tests to regenerate shared artifacts in `shared/`.

## Mobile CI
- `android-ci` runs Gradle lint, unit tests, and builds a release bundle. It verifies API compatibility and ensures no native binary artifacts are committed.
- `ios-ci` runs Swift linting, unit/UI tests, and builds an archive via xcodebuild. It validates entitlements and signing configuration.
- **Binary guard rules:**
  - Never commit built APK/AAB, IPA, xcarchive, `.so`, `.a`, or `.framework` binaries.
  - GitHub Actions enforce this with the `binary-guard` job. If you must distribute binaries, attach them as release artifacts instead of checking them in.

## QA flows

### M4 QA-HUD workflow
1. Enable the QA gate toggle in the app (Settings → Developer → QA HUD Gate).
2. Open the QA HUD screen from the Developer menu.
3. Tap **Start Capture** to begin recording HUD metrics.
4. Tap **Stop Capture** to finish.
5. Use **Export run** to download `hud_run.json` and attach it to your PR or upload to the QA storage bucket.

### M5 Bench workflow
1. Open the **QA Bench** screen.
2. Choose the run configuration: `{runtime, inputSize, quant, threads, delegate}`.
3. Tap **Run Bench** and wait for completion.
4. Use the upload action to push the run to BenchHub; copy the share link for your PR notes.

### M5.1 Default enforcement
1. The app fetches `/bench/summary` on boot and caches the defaults locally.
2. To test override behavior, toggle the remote config flag `edge.defaults.enforce` in the QA RC console.
3. Relaunch the app to confirm the cache is invalidated and new defaults are applied.

### M6 Replay workflow
1. Visit the web route `/qa/replay`.
2. Upload `hud_run.json` from an M4 capture.
3. Select a Bench run to compare against (same runtime + input size recommended).
4. Review the diff visualization and export the generated `.md` report for PR attachment.

## Pull Request checklist
Copy this block into your PR description and tick each box:

```
[ ] CI green
[ ] no binaries
[ ] updated docs if UI/QA changes
[ ] tests added
```
