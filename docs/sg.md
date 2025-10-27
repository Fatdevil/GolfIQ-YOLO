# Strokes Gained v1

This module provides a lightweight, on-device strokes-gained implementation that is safe to ship with the QA HUD tooling.

## Baseline tables

The expected-strokes tables live in [`shared/sg/baseline.ts`](../shared/sg/baseline.ts). They intentionally use coarse distance buckets so that the calculations remain fast and stable without relying on external dependencies. Distances are expressed in metres and cover:

- **Tee shots** – long distances, tuned for par 4/5 starts.
- **Approach shots** – 25–225 m buckets for full swings.
- **Short game** – 0–30 m chips and pitches.
- **Putting** – sub-12 m buckets derived from PGA make percentages.

Helpers exported from the module (`expStrokes_Tee`, `expStrokes_Approach`, `expStrokes_Short`, `expStrokes_Putt`, and `expStrokesFromDistance`) return the expected strokes to hole out for a given distance. Distances are clamped to keep the lookup monotonic and safe for negative or undefined input values.

## Engine

[`shared/sg/engine.ts`](../shared/sg/engine.ts) exposes `computeSG`, which takes a `ShotCtx` describing the shot phase, start distance, resulting distance, and whether the shot incurred a penalty or was holed. The engine:

1. Looks up the expected strokes at the start distance using the appropriate phase table.
2. Infers the next phase from the end distance (putt ≤ 12 m, short ≤ 30 m, otherwise approach, ≥ 220 m treated as tee) and fetches the expected strokes remaining.
3. Applies the strokes-gained formula `SG = exp(start) - (strokesTaken + exp(end))`, where `strokesTaken` is `1` plus any penalty strokes.

It returns the strokes-gained contribution for each phase, the total delta, and the expected stroke counts before and after the shot. `classifyPhase` is a helper that assigns a phase based on raw distance, and `expectedStrokesAfterShot` / `expectedStrokesForDistance` are convenience wrappers.

## Shot logging

`QAArHudOverlayScreen` enriches the shot session with:

- Phase classification and whether the recommended plan was adopted.
- Landing outcome (carry, end distance, holed heuristic) derived from local coordinates.
- Strokes-gained evaluation and EV before/after the shot.

The serialized HUD shot (`hud.shot`) now includes the SG payload, EV values, the measured end distance, and the adoption flag. This data is consumed by replay analysis and server-side health metrics.

## Replay visualisation

The web replay page renders an SG panel (`web/src/features/replay/SGPanel.tsx`) that groups shots per hole/segment and displays stacked bars for tee/approach/short/putt contributions. The markdown export (`mkReportMd`) now embeds the SG totals and adoption averages.

## Server metrics

`/caddie/health` aggregates SG totals per run and tracks the average lift between adopted and non-adopted shots. The response now includes `sg_gained_per_round` (mean/median) and `adoption_sg_lift` for daily monitoring.

## Testing

`tests/shared/sg/engine.spec.ts` verifies the engine with representative approach and tee scenarios, including penalty handling, and ensures the phase classifier behaves as expected.
