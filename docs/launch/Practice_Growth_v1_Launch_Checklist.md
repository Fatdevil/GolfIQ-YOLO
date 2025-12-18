# Practice Growth v1 — Launch Checklist

## What shipped
- Home dashboard "This week's practice" progress card with goal, streak, and weekly summary links.
- Practice Planner entry with recommended drills and missions.
- Practice Journal v1 (history, streaks, share).
- Weekly Practice Summary v1 (weekly totals, streak, plan progress, share, start CTA).
- Coach Report CTA to start practice with recommended drills/focus.
- Deep links for Practice Journal and Weekly Practice Summary.

## Entry points
- Home dashboard practice card links: Journal, Weekly Summary, Practice History/Quick Start, missions, planner.
- Classic Home practice card + planner card CTAs.
- Coach Report "Start practice" CTA (recommended drills/fallback categories).
- Direct navigation to Practice Journal / Practice Weekly Summary (including deep links).

## Rollout control
- Central feature flag: `practiceGrowthV1` (default: enabled).
- Disable behavior: practice cards/CTAs hidden; gated navigation redirects to Home Dashboard with `practice_feature_gated` telemetry.

## QA checklist
- Home dashboard
  - Practice card renders progress, goal pill, streak, weekly summary link, journal link when flag is ON.
  - Card hidden and no crashes when flag is OFF.
- Classic Home
  - Practice card + planner card render and navigate correctly when flag is ON.
  - Cards hidden when flag is OFF.
- Practice Journal
  - Loads sessions, streaks, sharing; navigates to Weekly Summary (source=journal) when flag is ON.
  - Deep link or navigation redirects to Home when flag is OFF (gated event recorded).
- Practice Weekly Summary
  - Loads sessions + plan; share + start practice CTA work when flag is ON.
  - Deep link redirects to Home when flag is OFF (gated event recorded).
- Coach Report
  - Recommended drills list and start CTA route to Planner when flag is ON.
  - Start CTA hidden when flag is OFF and no navigation occurs.
- Deep links
  - practice/journal and practice/weekly-summary open the correct screens when flag is ON.
  - With flag OFF, app returns to Home Dashboard without crash and emits gate telemetry.
- Analytics smoke
  - Verify practice_home_card_viewed / practice_home_cta fire when flag is ON.
  - Verify `practice_feature_gated` fires when navigation is blocked (deep link, home tap, coach report).

## Analytics event map
- `practice_home_card_viewed`
  - When: practice home card is first rendered (flag ON).
  - Props: `surface`, `hasPlan`, `totalDrills?`, `completedDrills?`.
- `practice_home_cta`
  - When: user taps start/view plan/build plan CTAs on home (flag ON).
  - Props: `surface`, `type` (start|view_plan|build_plan).
- `practice_weekly_summary_viewed`
  - When: weekly summary loads (flag ON).
  - Props: sessions/drills/streak/plan completion/source.
- `practice_weekly_summary_share`
  - When: share tapped from weekly summary (flag ON).
  - Props: same as viewed + share context.
- `practice_weekly_summary_start_practice`
  - When: start CTA tapped from weekly summary (flag ON).
  - Props: same as viewed + source.
- `practice_journal_opened`
  - When: journal screen mounts (flag ON).
  - Props: none.
- `practice_session_shared`
  - When: journal share tapped (flag ON).
  - Props: sessionId, minutes, drills.
- `practice_feature_gated`
  - When: navigation to practice growth surfaces is blocked by flag.
  - Props: `feature: "practiceGrowthV1"`, `target` (PracticeJournal|PracticeWeeklySummary|HomePracticeCard|CoachReportCTA), `source` (home|deeplink|coach_report|unknown).
