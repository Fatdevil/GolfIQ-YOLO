# Demo Assets

This folder contains small, deterministic inputs used by `scripts/run_demo.py` to showcase
GolfIQ's offline Demo Mode.

## Structure
- `cases/`: JSON case definitions that describe synthetic frame bundles.
- `golden/`: Expected metrics payloads for each case, used by `--verify`.

## Case definitions
Each case JSON defines the synthetic capture bundle:

- `case_id`: Unique identifier for the demo case.
- `description`: Short description of the scenario.
- `fps`: Frames per second for the capture (used for Range Mode guardrails).
- `frame_count`: Number of frames to generate.
- `width` / `height`: Frame dimensions in pixels.
- `pattern`: Frame generator configuration.
  - `type`: `checkerboard` or `solid`.
  - `low` / `high`: Checkerboard intensity values (0-255).
  - `value`: Solid intensity value (0-255).

The generator produces small RGB frames (uint8) so the pipeline can run without any
external video files or ML models.
