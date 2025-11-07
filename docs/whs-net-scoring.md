# WHS Net Scoring v1

This document describes the first iteration of GolfIQ's World Handicap System (WHS) net scoring support. The implementation aligns with the formulas that power the new handicap tools across the QA apps, web leaderboard, and event synchronisation services.

## Terminology

- **Handicap Index (HI)** – the player reference index produced by WHS.
- **Slope** – course difficulty relative to a standard slope of 113.
- **Course Rating (CR)** – expected score for a scratch golfer.
- **Course Handicap (CH)** – strokes a player receives for the course before any allowance.
- **Playing Handicap (PH)** – strokes after applying the competition allowance.
- **Stroke Index (SI)** – hole difficulty ranking (1 = hardest).
- **Net strokes** – gross score minus the strokes received on that hole.
- **Stableford points** – standard WHS Stableford (2 points for net par).

## Formulas

- **Course Handicap**: `CH = round(HI * (Slope / 113) + (CR - Par))`
- **Playing Handicap**: `PH = round(CH * (Allowance% / 100))`
- **Stroke allocation**: distribute `PH` strokes across holes in ascending SI order. Plus handicaps (negative PH) yield negative allocations on the toughest holes.
- **Net strokes**: `max(1, Gross - StrokesReceived)`
- **Stableford**: `max(0, 2 + (Par + StrokesReceived - Gross))`

Nine-hole tees set `tee.nine` to `front`, `back`, or `18`. Stroke indexes can be entered for 9 or 18 holes; if omitted we fall back to sequential numbering.

## Allowances

Different competition formats can pick any allowance percentage. Common examples:

| Format            | Allowance |
| ----------------- | --------- |
| Stroke play       | 95%       |
| Match play        | 100%      |
| Stableford        | 95%       |
| Fourball stroke   | 85%       |

The playing handicap scales linearly with the allowance percentage.

## Round integration

1. Store the configured `HandicapSetup` on the active round (`shared/round/round_store`).
2. When a QA round pushes scores to an event, compute `courseHandicap`, `playingHandicap`, per-hole net, and Stableford with `computeNetForRound`.
3. Persist per-hole `net`, `stableford`, `strokes_received`, and handicap metadata with the event score payload.
4. Aggregate leaderboards by summing gross, net, and Stableford totals.

## UX considerations

- The Handicap panel accepts freeform stroke-index input (comma-separated) and visualises the allocated strokes per hole.
- Saved setups persist with the QA round and can be broadcast to the current event context.
- Leaderboards surface playing handicaps (PH) next to player names and optionally show Stableford totals when provided.

## Assumptions & limitations

- PCC (Playing Conditions Calculation) is not implemented.
- We assume stroke indices are either 9 or 18 entries; mismatches fall back to sequential allocation.
- Stableford scoring follows the standard WHS schedule without custom variants.
