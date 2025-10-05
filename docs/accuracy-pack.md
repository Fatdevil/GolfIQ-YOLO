# Accuracy validation pack

The accuracy pack provides a deterministic golden dataset plus tooling to guard ball flight metrics.

## Golden dataset

* Location: [`data/golden`](../data/golden)
* Version: `1.0.1`
* Contents: 12 mocked swings stored as base64-encoded ZIP archives (`swings/swing-*.zip.b64`). Each archive expands to 6 frames (`.npy`, 240×320 RGB) generated with deterministic noise, along with metadata (`metadata.json`). The base64 wrapper keeps the repository text-only, so PR tooling never rejects binary payloads and Git LFS is no longer required.
* Expected metrics per clip: `ballSpeed` (m/s), `sideAngle` (degrees), `carry` (meters).
* Threshold defaults (also embedded in `metadata.json`):
  * `ballSpeed`: `mae ≤ 0.35 m/s`, `p95 ≤ 0.60 m/s`, `mape ≤ 8%`
  * `sideAngle`: `mae ≤ 3°`, `p95 ≤ 5°`
  * `carry`: `mae ≤ 0.40 m`, `p95 ≤ 0.60 m`, `mape ≤ 12%`

The deterministic motions are tuned so the mocked pipeline emits stable metrics even without GPU weights. This makes the pack safe to run in CI and on developer laptops.

## Evaluation CLI

```
python tools/eval_accuracy.py --dataset data/golden --out reports/accuracy.json
```

Key options:

* `--out`: Where to write the report JSON (defaults to `reports/accuracy.json`).
* `--thresholds`: Path to a JSON file (same structure as `metadata.thresholds`) to override gates.
* `--mock {auto,on,off}`: Force mock detection (`on`), disable it (`off`), or use per-clip metadata (`auto`).
* `--fail-on-missing`: Fail if any expected metric is `null`.

The report captures per-metric aggregates (`mae`, `mape`, percentiles) and a per-clip error table. Failing gates return exit code `1`.

## Web dashboard

The Accuracy Board lives at `/accuracy` in the web UI. It loads `reports/accuracy.json` (overridable via `VITE_ACCURACY_REPORT`) and renders:

* Status chips for each metric, showing MAE, P95, MAPE, and configured thresholds.
* Small bar charts showing per-clip absolute errors with reference lines for thresholds.
* A detailed clip table for auditing.

## CI gate

`.github/workflows/accuracy-gate.yml` runs on pull requests and manual dispatch. It installs Python dependencies and runs the evaluator twice:

1. `--mock on` to exercise the deterministic pipeline used by the golden dataset.
2. `--mock off` to ensure the analyzer path without forced mock still stays within thresholds.

Both reports are uploaded as workflow artifacts (`accuracy-mock.json`, `accuracy-real.json`). Any threshold breach fails the job.

## Adding new clips

1. Encode the new ZIP as base64 and save it as `data/golden/swings/<id>.zip.b64` (wrap at 76 characters for readable diffs). A helper snippet:

   ```python
   import base64, io, zipfile, numpy as np
   from pathlib import Path
   buf = io.BytesIO()
   with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
       # add frames...
       pass
   encoded = base64.b64encode(buf.getvalue()).decode()
   Path("data/golden/swings/<id>.zip.b64").write_text("\n".join(encoded[i:i+76] for i in range(0, len(encoded), 76)) + "\n")
   ```

2. Append an entry to `data/golden/metadata.json` with:
   * `id`, `file`, `calibration` (`ref_len_m`, `ref_len_px`, `fps`).
   * `mock` (usually `true`), optional `motion` tuple for deterministic YOLO mock motion.
   * `expected` metrics – run `python tools/eval_accuracy.py --out reports/preview.json` and copy the actual metrics.
3. Run the evaluator locally to ensure gates pass:
   * `python tools/eval_accuracy.py --dataset data/golden --out reports/accuracy.json`
4. Commit the updated base64 archive, metadata, and refreshed `reports/accuracy.json`.

Keep the dataset deterministic (no random seeds that change between runs) so CI remains stable.
