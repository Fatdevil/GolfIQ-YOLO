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

## Range Session Detail v1

- Tapping any history row (or the new "View full session details" link on the Quick Practice summary) opens a **Range session** detail screen.
- The detail view shows the session header (date, club, shot count), the saved training goal when present, key stats like average carry/target/tendency, and the Range Story card for the session.
- A "Share summary" action invokes the OS share sheet with a concise text recap for sending to a coach or friend.

## Range Progress Overview v1 (recorded check-ins)

- Recorded Quick Practice sessions now power a **Range progress** screen from the Range hub.
- The screen summarises how many recorded check-ins you have, the approximate volume of recorded shots, your most-logged clubs, and simple quality hints when there is enough recent data.
- Quality trends stay hidden when the recent sample is too small, encouraging golfers to record a few more sessions first.

## Range Missions v1

- A new **Range missions** screen in the Range hub lists a handful of curated drills with difficulty, suggested clubs, and shot targets.
- Missions are stored locally; players can mark them completed and pin one as the current focus.
- Starting Quick Practice from a mission carries the tag into the session summary and history so past sessions show which drill was in mind.
