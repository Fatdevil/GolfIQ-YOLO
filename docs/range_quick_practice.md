# Range Quick Practice

Quick Practice is our lightweight range flow: pick a club (optional), choose your camera angle, run through setup, and log a bucket with automatic shot analysis. Summaries are stored locally so players can resume quickly and review their last outing.

## Home card

- The GolfIQ Play home screen now surfaces a **Range & Training** card with a single tap entry to Quick Practice.
- The card previews the latest range session using the cached `golfiq.range.lastSession.v1` summary (club + shot count when available).
- When no history exists, it shows a friendly empty state encouraging players to start a Quick Practice.
- A tiny teaser reminds users that planned missions are coming soon.

## Range Story v1

Quick Practice now adds a lightweight Range Story to the summary. We build a short headline plus strengths and next-focus bullets from the saved `RangeSessionSummary` (shot count, average carry vs target, and tendency). The card stays local to the device and updates each time a session ends.

## Training Goal v1

- Players can set a short, local-only training goal that appears on the Range hub and Quick Practice start screens.
- The goal text is saved on each Quick Practice summary and shown on the summary screen and in Range history entries when present.
- Editing or clearing the goal is done from the Training Goal screen; empty text clears the current goal.

## Range History v1

- Each finished Quick Practice session is appended to a local history list (up to 30 entries) alongside the existing "last session" cache.
- Players can open the new **Range history** screen from the Range hub (and from the Quick Practice summary) to see recent sessions with date, club, shot count, and a short focus tag from the Range Story model.
- History is fully local: corrupt data is ignored and never crashes the app.
