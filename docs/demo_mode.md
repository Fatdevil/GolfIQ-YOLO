# Demo Mode (Offline)

Demo Mode is a fully offline, deterministic showcase of GolfIQ's Range Mode analysis. It is
built for product demos with golfers and investors and runs on a clean machine without
network calls or new video capture.

## What Demo Mode shows
Each demo case produces a metrics payload that highlights:

1. **Capture-quality HUD** (READY/WARN/BLOCK)
2. **`explain_result`** confidence and guidance
3. **`micro_coach` tips** (up to 3 actionable items)

The story is consistent: _capture quality → confidence → concrete fixes_.

## How to run
```bash
python scripts/run_demo.py --case ready
python scripts/run_demo.py --case ready --verify
python scripts/run_demo.py --case warn --out demo_out/warn.json
```

The output is written to `demo_out/<case_id>.json` by default.

## What to look at in the output
- `capture_quality.range_mode_hud.state` → READY/WARN/BLOCK
- `explain_result.confidence.label` → HIGH/MED/LOW
- `micro_coach.tips` → 1–3 prioritized fixes

## Add a new demo case
1. Add a JSON definition in `demo_assets/cases/<case_id>.json` describing the synthetic
   frames (size, FPS, pattern).
2. Run the demo to generate output:
   ```bash
   python scripts/run_demo.py --case <case_id>
   ```
3. Copy the generated output into `demo_assets/golden/<case_id>.json`.
4. Update or add tests in `cv_engine/tests/test_demo_mode.py` if needed.

Demo cases are intentionally small to keep the repository lightweight and deterministic.
