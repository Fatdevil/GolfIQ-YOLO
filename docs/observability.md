# Observability & OpenTelemetry

The CV pipeline emits OpenTelemetry spans when tracing is enabled. This makes it
possible to inspect latency in Grafana/Tempo or to debug locally with the
console exporter.

## Enabling tracing

Set the following environment variables before starting any process that invokes
`cv_engine.pipeline.analyze.analyze_frames`:

- `GOLFIQ_OTEL_ENABLED=1` &ndash; turns on span creation.
- `GOLFIQ_OTEL_EXPORTER=otlp` (default) or `console` &ndash; choose the exporter.
- `OTEL_EXPORTER_OTLP_ENDPOINT` &ndash; point to your OTLP collector when using the
  OTLP exporter.
- Optional: `GOLFIQ_OTEL_SCOPE`, `OTEL_SERVICE_NAME`, `OTEL_SERVICE_NAMESPACE`,
  and `GOLFIQ_ENV` to customise service metadata.

When the OpenTelemetry SDK or requested exporter is not available the code
falls back to a noop tracer, so enabling tracing in environments without the
SDK is safe.

## Instrumented spans

`analyze_frames` now wraps the major CV stages with nested spans:

- `cv.pipeline.analyze` (root span) &ndash; carries attributes such as
  `cv.frames_total`, tracker backend, pose backend, and per-stage timings in
  milliseconds.
- `cv.pipeline.detection`
- `cv.pipeline.tracking`
- `cv.pipeline.pose`
- `cv.pipeline.kinematics`
- `cv.pipeline.impact`
- `cv.pipeline.postproc`

Each span exposes useful attributes: detection reports the number of boxes,
tracking spans record the track lengths, impact spans emit the detected impact
count and confidence, and post-processing carries the final confidence value.

## Example trace

```bash
export GOLFIQ_OTEL_ENABLED=1
export GOLFIQ_OTEL_EXPORTER=console
python - <<'PY'
import numpy as np
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames

frames = np.load('tests/assets/backview_golden_clip.npy')
calib = CalibrationParams(m_per_px=0.01, fps=120.0)
analyze_frames(frames, calib, mock=True)
PY
```

With the console exporter you will see the nested spans, including the per-stage
attributes and timings, printed to stdout. Switch to the OTLP exporter to ship
traces to your collector of choice.
