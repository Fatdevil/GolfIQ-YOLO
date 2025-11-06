# Auto-Hole Detection

Auto-hole detection keeps the AR HUD aligned with the current hole by watching player location relative to mapped tees and greens, accumulated heading, and short-term motion. The heuristics layer exposes the following behavior:

## What triggers a switch

* **Green settling** – when the detector is stable on a green, it records the current hole.
* **Tee lead** – while on the current green we track the nearest tee. Hitting the tee lead vote threshold (see below) attempts to advance to the next hole.
* **Manual overrides** – operators can select the next/previous hole, undo the last switch, or toggle auto mode from the AutoHole chip.

Every switch records metadata (`lastSwitch`) capturing the previous hole, new hole, timestamp, and reason (`tee-lead`, `putt-advance`, `manual`, or `undo`). The previous hole is preserved on `prevHole` for fast undo.

## Vote thresholds

* `ADVANCE_VOTES = 3` consecutive tee-lead observations are required before attempting an automatic advance.
* Votes reset whenever a switch happens or the detected tee changes.

## Dwell behavior

* `ADVANCE_DWELL_MS = 15_000` (15 seconds) is the minimum dwell before another automatic advance can occur.
* The dwell timer applies to **all** automatic switches (tee-lead and putt-advance) and is also refreshed on manual or undo actions to prevent immediate oscillation.
* `canAutoAdvance()` exposes the dwell guard and is used by both the detector loop and manual tools.

## Undoing and going manual

* Manual **Prev/Next** buttons call `advanceToHole(state, target, Date.now(), 'manual')` which updates state, clears tee-lead votes, and starts a new dwell window.
* **Undo last** replays `advanceToHole(state, state.prevHole, Date.now(), 'undo')` if a previous hole exists.
* Auto mode can be toggled off to freeze the current hole; confidence and votes continue to update in the background for visibility.

## Telemetry

Two lightweight telemetry events are emitted:

* `autohole.switch` – fired inside `advanceToHole` with course, from/to hole, reason, confidence, and dwell time.
* `autohole.status` – emitted periodically by controllers/UI with course, hole, confidence, tee lead, votes, and whether auto mode is enabled.

These events are intended for QA dashboards only; no backend changes are required.
