# Strokes-Gained Impact Overview

This note summarises how highlight clips are scored for the **strokes-gained impact (SGΔ)** badge and the new Top Shots ranking.

## Baseline assumptions

- A compact tour baseline maps distance-to-hole (metres) and lie (`tee`, `fairway`, `rough`, `sand`, `green`) to expected strokes-to-hole-out.
- The server stores ~10 reference points per lie and linearly interpolates between them. Distances outside the range clamp to the nearest breakpoint.
- SGΔ for a shot or clip is calculated as:

  ```text
  SGΔ = (E[start] - E[end]) - strokes_used
  ```

  If the player holes out during the clip, `E[end]` is omitted.

## API surface

- `POST /clips/{clipId}/metrics`
  - Body: `{ startDistM, endDistM | null, strokesUsed, lieStart? }`
  - Response: `{ sgDelta, anchorSec }`
  - Emits `clip.sg.recorded` telemetry.
- `GET /clips/{clipId}` now includes `sgDelta` and `anchors` (seconds) so the UI can render badges and seek buttons.
- `GET /events/{eventId}/top-shots` returns the ranked clip list with `score`, `sgDelta`, and anchors. A `clip.rank.evaluated` telemetry event tracks each evaluation.

## Ranking formula

The Top Shots score is computed as:

```text
score = reactions_1min + α · log(1 + reactions_total) + β · SGΔ + γ · recency_minutes⁻¹
```

- `α`, `β`, `γ` default to `0.6`, `1.0`, and `0.3` respectively. Override them via environment variables:
  - `VITE_TOP_SHOTS_ALPHA`
  - `VITE_TOP_SHOTS_BETA`
  - `VITE_TOP_SHOTS_GAMMA`
- Client-side ranking falls back to the same formula if the server does not include a numeric `score` value.

## Examples

- **Positive SGΔ**: a 2 m putt holed in 1 stroke → SGΔ ≈ `+0.08`. Badge renders green.
- **Negative SGΔ**: a 5 m putt taking 3 strokes → SGΔ ≈ `-1.5`. Badge renders red.
- Anchors default to the clip midpoint when no specific impact timestamp is supplied, ensuring every ranked clip exposes at least one seek target.
