# AR-HUD MVP Scaffolding

The MVP scaffolding introduces a head-up display control loop that is still flag-gated from production UI entry points. The focus is on laying down shared logic and instrumentation SLOs without wiring any visible changes.

## Operating SLOs

The shared library exports conservative latency and accuracy targets that other clients can import while the HUD matures:

- **FPS_MIN = 30** — the capture pipeline should never dip below 30 FPS while rendering the HUD overlay.
- **HUD_LATENCY_MAX_MS = 120** — end-to-end render latency target across sensor fusion, network, and draw stacks.
- **RECENTER_MAX_S = 2** — maximum time budget for user-triggered recentering loops.
- **HEADING_RMS_MAX_DEG = 1.0** — sustained heading jitter budget after smoothing.

## Finite State Machine

The state machine models the early HUD lifecycle and escape hatches.

```text
AIM --(aimAcquired)--> CALIBRATE --(calibrated)--> TRACK
TRACK --(recenterRequested)--> RECENTER --(recentered)--> TRACK
```

Additional protections:

- `trackingLost` immediately forces a return to `AIM` from any state so that reacquisition flows are deterministic.
- Illegal events are ignored and leave the machine in-place (no implicit transitions).
- `reset()` always jumps back to `AIM` to allow consumers to start fresh after teardown.

## Heading Smoothing Strategy

Heading smoothing uses a circular-aware exponential moving average (`α ≈ 0.2` by default). The smoother normalizes headings into the `[0°, 360°)` domain, computes the shortest signed delta, and advances the smoothed heading by `α · Δ`. This prevents sudden jumps when raw bearings cross the `0°/360°` boundary.

To keep numerical stability, the smoother tracks a configurable sliding window of residual errors and exposes a running RMS check. Consumers can assert against `HEADING_RMS_MAX_DEG` to ensure jitter stays inside the budget. Example:

```ts
const smoother = createHeadingSmoother();
const samples = [358, 2, 4];
const outputs = samples.map((deg) => smoother.next(deg));
// outputs ≈ [358, 0, 2]
const rms = smoother.rms();
// rms <= HEADING_RMS_MAX_DEG
```

Resetting the smoother clears its state and RMS window so HUD sessions can be isolated between shots.
