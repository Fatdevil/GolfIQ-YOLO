# Golden Regression Gate

The `tests/golden/test_backview_golden.py` suite protects the CV metrics against
unexpected drift. It runs a mock-backed pipeline on a tiny synthetic clip and
compares the results with a stored golden reference.

## Thresholds

- `ballSpeedMps`: ±3% relative tolerance
- `sideAngleDeg`: ±1.5° absolute tolerance
- `carryEstM`: ±12 m absolute tolerance

When a change exceeds the tolerance the GitHub Actions job will fail, preventing
regressions from landing unnoticed.

## Local execution

```bash
pip install -r requirements-dev.txt
pytest tests/golden/test_backview_golden.py
```

Use this test when modifying detection, tracking, or kinematics logic. Update
the `tests/assets/backview_golden_metrics.json` file only when a change is
intentional and validated.
