# Model export pipeline

This repository ships a reproducible export utility that starts from PyTorch-style
weights and produces a set of portable artefacts for ONNX, TFLite (FP32 and optional
INT8), CoreML (FP16), and NCNN.  The pipeline is optimised for CI usage – it can run
entirely with synthetic weights so that we do not need to commit large checkpoints.

## Quick start

```bash
# Install the minimal dependencies
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt  # plus onnx coremltools tensorflow onnxruntime

# Run the exporter with default dummy weights
python scripts/export_models.py
```

All artefacts and the `manifest.json` will be placed under `exports/`.

## CLI reference

```
usage: export_models.py [-h] [--model-name MODEL_NAME] [--weights WEIGHTS]
                        [--input-size INPUT_SIZE] [--int8] [--dummy]
                        [--output-dir OUTPUT_DIR]
```

| Flag | Description |
| --- | --- |
| `--model-name` | Logical name of the model. Defaults to `golfiq-lite`. |
| `--weights` | Path to a checkpoint. Supports `.npz` or `.pt/.pth`. Optional. |
| `--input-size` | Square input size (e.g. 320). |
| `--int8` | Emit an additional INT8 quantised TFLite model. |
| `--dummy` | Force synthetic weights, ignoring checkpoints. Useful for CI. |
| `--output-dir` | Destination directory. Defaults to `exports/`. |

Every flag also has an environment override (e.g. `EXPORT_MODEL_NAME`,
`EXPORT_WEIGHTS_PATH`, `EXPORT_INPUT_SIZE`, `EXPORT_INT8`, `EXPORT_DUMMY`,
`EXPORT_OUTPUT_DIR`).

## Outputs

Running the exporter creates:

- `<model>.onnx`
- `<model>.fp32.tflite` (+ `<model>.int8.tflite` when `--int8` is used)
- `<model>.mlmodel` (CoreML FP16)
- `ncnn/<model>.param` and `ncnn/<model>.bin`
- `manifest.json` summarising the artefacts (paths, byte size, SHA256)

The manifest can be consumed by downstream tooling to locate the generated files
without scanning the directory.

## Sanity checks

A lightweight sanity check runs after export:

1. Build a deterministic dummy input.
2. Execute the ONNX model with `onnxruntime`.
3. Execute every target (TFLite, CoreML, NCNN reference math) and compare logits
   against the ONNX output.  On platforms without a CoreML runtime (e.g. Linux),
   the script skips the CoreML inference step after conversion and logs the
   reason so the rest of the pipeline can still be validated.

The command aborts if a shape mismatch or a large numeric drift is detected.

## Troubleshooting

- **Missing dependencies** – Install `onnx`, `onnxruntime`, `tensorflow` (or
  `tensorflow-cpu`), and `coremltools>=6`.  PyTorch is optional; it is only needed
  to read real `.pt/.pth` checkpoints.
- **INT8 conversion fails** – Some environments lack the ops required for fully
  quantised builds.  The exporter will log the failure and continue with FP32.
- **Manifest missing** – Ensure that the `exports/` directory is writable; the
  script writes artefacts before producing `manifest.json`.
- **"Binary files are not supported"** – Some environments cannot execute CoreML
  models directly.  The exporter now recognises this error, logs a warning, and
  continues without the CoreML sanity check while still emitting the FP16
  `.mlmodel` artefact.
- **NCNN runtime** – The generated `.param`/`.bin` files are lightweight placeholders
  compatible with the sanity check.  Replace them with real `onnx2ncnn` outputs when
  integrating production pipelines.

## Continuous Integration

The repository contains a GitHub Actions workflow (`export-dryrun.yml`) that runs
`python scripts/export_models.py --dummy` to validate the pipeline.  The workflow
only checks that the artefacts and manifest can be produced; no large checkpoints
are required.
