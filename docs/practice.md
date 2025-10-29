# Practice & Retention Builder v2

The Practice & Retention Builder combines the new Training Focus packs with a lightweight weekly planner, opt-in reminders, and strokes-gained (SG) focus trends. Everything runs locally on device – no personal data leaves the phone beyond the run telemetry that already powers SG.

## Weekly plan generator

* Training plans expose a `schedule` string (`"2x/week"` or `"custom"`).
* `shared/training/scheduler.ts` turns a plan plus focus into timestamped sessions.
  * Sessions are generated per ISO week. The identifiers stay stable for the same week so a regeneration does not duplicate work.
  * Default cadence is two sessions per week (Tuesday/Friday at 18:00 local) for up to two weeks when the schedule is `2x/week`.
  * Each session carries the resolved drill payload so the app can render drill meta without re-reading packs.
* `GoalsPanel` invokes the scheduler when the user taps **Starta program**. Sessions surface immediately in `Practice/SessionList` where they can be marked complete or skipped.

## Local reminders

* `shared/notifications/local_reminders.ts` wraps Expo Notifications behind a safe dynamic import.
  * `ensureReminderPermission()` requests permission before any scheduling call.
  * `scheduleReminder(date, text)` is best-effort: it returns `null` when the API is missing (web) or permissions are denied.
  * `cancelAllPracticeReminders()` clears previously scheduled practice reminders.
* In `GoalsPanel` the “Lokala påminnelser” toggle is opt-in. If permission is declined the toggle stays off and the user receives an alert.
* Reminders are generated for upcoming sessions (up to six at a time) and can be disabled at any point from the toggle. Disabling immediately cancels scheduled notifications.

## SG trend by focus

* `shared/sg/trend.ts` computes rolling deltas for the last 7-day and 30-day windows per focus. The delta is the difference between the current window average and the preceding window average.
* The server augments `/caddie/health` with `sg_trend_by_focus`, mirroring the client calculation for dashboards.
* The Goals panel fetches the health payload (`?since=30d`) and shows a positive/negative delta widget beside the selected focus. When no data exists the UI explains that the trend is unavailable.

## Session list lifecycle

* `Practice/SessionList` renders upcoming sessions and keeps a quick history of completed or skipped items.
* Completing or skipping a session only updates local state and fires a tagged console event (`practice:event`).

## Stopping reminders

Users can stop reminders any time by flipping the “Lokala påminnelser” toggle off. This immediately calls `cancelAllPracticeReminders()` and clears any scheduled notifications. Uninstalling the app or clearing storage removes all locally stored practice state – no reminders or plan metadata is persisted server-side.
