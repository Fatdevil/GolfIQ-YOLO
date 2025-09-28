# Golden Assets

This directory stores golden screenshot baselines for AR-HUD v1 testing.

## Regenerating
1. Launch the AR-HUD demo via `make run-ios` or `make run-android`.
2. Capture screenshots for each HUD state at the required font scales.
3. Replace the existing images under `tests/golden/hud_states/` and copy updated assets here for archival.
4. Update the compare harness in `tests/simulations/test_camera_paths.py` to point to the new timestamps if needed.

Keep this directory in source control so visual regressions stay traceable.