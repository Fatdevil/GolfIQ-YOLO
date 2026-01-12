# Benchmarking Detector Variants

This benchmark suite compares two detector variants (e.g., YOLOv10 vs YOLOv11) on a shared dataset split. It produces a machine-readable JSON report and a human-readable Markdown summary, with optional per-image CSVs.

## Dataset format (YOLO)

```
<dataset>/
  images/
    IMG_001.npy
    IMG_002.npy
  labels/
    IMG_001.txt
    IMG_002.txt
```

Label files use standard YOLO format for a single class (ball):

```
<class_id> <x_center> <y_center> <width> <height>
```

Coordinates are normalized [0, 1]. Only class `0` is evaluated. Use `.npy` images for CI-safe runs; PNG/JPG are supported if `imageio` is installed.

## Commands

Compare two variants:

```
python -m cv_engine.bench.cli compare \
  --dataset /path/to/golfball_testset \
  --model-a yolov10 \
  --model-b yolov11 \
  --outdir bench_out
```

Optional flags:

- `--iou-threshold` (default `0.5`)
- `--conf-threshold` (default `0.25`)
- `--max-images` (limit samples for quick runs)
- `--seed` (default `1337`, keeps ordering deterministic)
- `--write-csv` (emit per-image CSVs)
- `--weight-a`/`--weight-b` (override model weight path)

## Outputs

`bench_out/metrics.json` includes full-precision metrics and metadata (thresholds, seed, git SHA when available).
`bench_out/summary.md` provides a compact comparison table with deltas.
If `--write-csv` is used, per-image CSVs are written as `per_image_a.csv` and `per_image_b.csv`.

## Adding a new model id

Add the variant to `cv_engine/inference/model_registry.py` (`ALLOWED_VARIANTS`) and implement a `DetectionEngine` adapter under `cv_engine/inference/`.
