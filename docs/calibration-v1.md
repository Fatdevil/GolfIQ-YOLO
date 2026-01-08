# Calibration v1 (px→m scale + launch window + trajectory fit)

Calibration v1 provides optional, additive metrics for carry, peak height, launch
angle, and speed by converting pixel tracks to meters. It is **disabled by
default** and does not change existing outputs unless enabled.

## Enabling Calibration

Calibration can be enabled either by setting an environment flag or by providing
an explicit calibration payload in the request.

### Environment flag

```
GOLFIQ_ENABLE_CALIBRATION_V1=true
```

### Request payload

For `/cv/analyze` and `/cv/analyze/video`, pass a `calibration` field containing
JSON (string-encoded in multipart forms):

```json
{
  "enabled": true,
  "referenceDistanceM": 1.0,
  "referencePointsPx": [[120.0, 620.0], [220.0, 620.0]],
  "cameraFps": 120.0
}
```

Alternatively, you can provide a direct pixel scale:

```json
{
  "enabled": true,
  "metersPerPixel": 0.005,
  "cameraFps": 120.0
}
```

If `cameraFps` is omitted, speed is not reported.

## Output fields (additive)

When enabled, the response includes:

```json
{
  "calibrated": {
    "enabled": true,
    "metersPerPixel": 0.005,
    "carryM": 45.2,
    "peakHeightM": 9.3,
    "launchAngleDeg": 14.5,
    "speedMps": 62.1,
    "launchWindow": {
      "start": 3,
      "end": 17,
      "confidence": 0.82
    },
    "quality": {
      "reasonCodes": [],
      "confidence": 0.74
    }
  }
}
```

If calibration is enabled but insufficient inputs are provided, the
`calibrated` payload is returned with `enabled=false` and a `reasonCodes` entry
such as `missing_reference` or `missing_fps`.

## Approximation notes

- `launchAngleDeg` is estimated from early flight frames.
- `speedMps` is only reported when a reliable `cameraFps` is available.
- No wind correction or spin inference is performed.
