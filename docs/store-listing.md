# Store Listing Automation Guide

This guide captures the workflow for generating GolfIQ Back-view v1.2 store
assets, including screenshots, privacy labels, and distributable bundles.

## Shot List

Screenshots are exported at `@2x` resolution to `dist/screens/`:

| File | Description |
| ---- | ----------- |
| `runs@2x.png` | Runs list showcasing persisted analyzer runs. |
| `run-detail@2x.png` | Run detail payload with tracer overlay and quality badges. |
| `ar-hud-mock@2x.png` | Mock AR-HUD overlay metrics generated via the mock analyzer. |
| `coach@2x.png` | Coach v1 narrative with swing guidance and key metrics. |

## Text Templates

**Short description**

> HUD-calibrated swing analyzer with instant tracer overlays, AR-HUD preview,
> and provider-backed Coach insights.

**Full description outline**

1. **Instant Analyzer** – Upload HUD runs or field captures to receive tracer
   overlays, ball/club metrics, and quality flags.
2. **AR-HUD Preview** – Validate overlay behaviour with the mock analyzer before
   deploying to on-course builds.
3. **Coach Feedback** – Provider-backed summaries recommend adjustments for
   speed, launch, and path.
4. **Privacy-first Telemetry** – Analytics and crash reporting remain disabled by
   default, with remote kill switches and aggressive scrubbing.

## Local Workflow

All commands run from the repository root. The tooling uses the TypeScript
scripts under `tools/` and Python helpers.

```bash
# Install dependencies
npm install
npm install --prefix web

# Generate privacy labels
npm run store:privacy

# Capture screenshots (spawns Vite preview if --base is not provided)
npm run store:screens            # or npm run store:screens -- --base https://demo.golfiq.app

# Build ZIP bundle (screens, privacy JSON, release notes if present)
npm run store:zip

# Optionally attach ZIP to GitHub release v1.2 when GH_TOKEN is exported
export GH_TOKEN=ghp_xxx
npm run store:attach
```

Artifacts land in `dist/`:

- `dist/screens/*.png`
- `dist/apple_privacy.json`
- `dist/play_datasafety.json`
- `dist/store_v1.2.zip`

Use `scripts/make_store_zip.sh` if you need to regenerate the archive outside of
`npm`.

## Localization Stubs

| Locale | Short (≤80 chars) | Long synopsis |
| ------ | ----------------- | ------------- |
| en-US | `HUD analyzer + Coach guidance for every swing.` | `Back-view v1.2 pairs AR-HUD overlays, analyzer insights, and optional Coach feedback. Customize telemetry with remote kill switches.` |
| en-GB | *(pending)* | *(pending)* |
| de-DE | *(pending)* | *(pending)* |
| ja-JP | *(pending)* | *(pending)* |

Fill in remaining locales during content QA.
