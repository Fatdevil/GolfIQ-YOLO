# AR HUD Re-center v2

## Overview

The AR HUD heading pipeline now couples a deterministic extended Kalman filter (EKF) with a
time-based lock controller. The goal is to stabilise the yaw estimate, acquire a lock within
≤ 2.0 s under normal sensor noise, and surface QA metrics that explain the outcome.

## Yaw EKF

State vector \(x = [\psi, b]^T\) stores the wrapped yaw \(\psi\) and a constant gyro bias \(b\).

Process model:

\[
\psi_k = \mathrm{wrap}\left(\psi_{k-1} + (\omega_k - b_{k-1}) \Delta t\right)\\
b_k = b_{k-1}
\]

Process noise uses diagonal covariance with tunable spectral densities \(q_\psi\) and \(q_b\)
scaled by \(\Delta t\).

Measurement model uses magnetometer yaw:

\[
z_k = \psi_k + v_k, \quad R_k = \frac{r_\mathrm{mag}}{q^2}
\]

where \(q\in[0,1]\) is a quality weight (low quality inflates \(R_k\)).

Default parameters:

| Symbol | Description | Value |
| --- | --- | --- |
| \(q_\psi\) | yaw process spectral density | 1.0 × 10⁻³ |
| \(q_b\) | bias process spectral density | 5.0 × 10⁻⁵ |
| \(r_\mathrm{mag}\) | base magnetometer variance | 4.0 × 10⁻³ |

The EKF is NaN-safe, wraps angles into \((-\pi, \pi]\), and only predicts when \(\Delta t > 0\).

## Re-center controller

The controller consumes EKF yaw samples and drives a four-state automaton:

1. **idle** – waiting for a start command.
2. **seeking** – sampling error \(|\Delta\psi|\) against the chosen reference.
3. **locked** – error stayed within the lock threshold for the stability window.
4. **timeout** – seeking exceeded the timeout without achieving lock.

Configuration defaults:

| Parameter | Purpose | Default |
| --- | --- | --- |
| `lockThresholdDeg` | max absolute error to count as stable | 2.0° |
| `stableMs` | time that error must stay under threshold | 600 ms |
| `timeoutMs` | hard deadline for seeking | 2000 ms |
| `maxDriftDeg` | drift that resets the stability window | 4.0° |

Each sample updates a 300 ms sliding RMS of the error. The RMS maps to quality bands:

| RMS band | Quality |
| --- | --- |
| ≤ 0.5° | excellent |
| ≤ 1.5° | good |
| ≤ 3.0° | fair |
| > 3.0° | poor |

The controller reports elapsed time, error, state, and quality in a deterministic structure.

## QA instrumentation

The QA overlay exposes a "Re-center" action that seeds the reference with the current EKF yaw
and feeds every animation-frame sample into the controller. On state transitions to `locked` or
`timeout`, the UI emits telemetry (when enabled) using the event `arhud.recenter.v2` with:

```
{ lockMs, outcome: 'locked' | 'timeout', avgErrDeg, rmsErrDeg }
```

`avgErrDeg` and `rmsErrDeg` capture the seeking window statistics for QA dashboards.

## Service-level objectives

- **Acquisition:** lock within 2.0 s during nominal noise.
- **Stability:** post-lock heading jitter ≤ 2° (RMS) for 95 % of samples.

These SLOs can be verified in CI via deterministic sensor stubs and on-device via the QA HUD.
