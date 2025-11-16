# GolfIQ-YOLO v1 Launch Scope

## Core v1 (Free plan)

- Quick Round
  - 9/18 hole rounds
  - Gross and net scoring vs handicap
- Range Practice
  - Impact card (ball speed, carry, launch, side)
  - Target Bingo
  - Missions & Groove meter
  - Range session history
- Trip Mode
  - Multi-player quick round scoreboard
  - Shareable read-only scorecards
- My GolfIQ Profile
  - Round statistics (totals/averages)
  - Range sessions list
  - Bag snapshot

## Pro / Beta features

- Range
  - GhostMatch vs saved ghost sessions
  - Smart Bag Sync (auto carry suggestions from range data)
  - Camera Fitness feedback
- Trips
  - Live SSE-powered scoreboard
- My GolfIQ
  - Insights card (strengths, focus areas, suggested mission)
- Watch
  - HUD v1.5 (distance, caddie confidence, tournament-safe gating)

## Feature flags & plans

- `/api/access/plan` returns `{"plan":"free"|"pro"}`.
- `UserAccessProvider` and `useFeatureFlag(featureId)` control which features the UI exposes per plan.
- `FeatureGate` renders a Pro teaser when a feature is not enabled for the current plan.
- `ProBadge` marks Pro-only features; `BetaBadge` marks early-access features.
