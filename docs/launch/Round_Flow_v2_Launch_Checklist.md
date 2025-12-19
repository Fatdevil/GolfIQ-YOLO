# Round Flow v2 Launch Checklist

Use this checklist when toggling `roundFlowV2` via the remote rollout:

- **Flag ON**: new flow start/resume/end works without errors.
- **Flag OFF**: legacy round flow remains unchanged.
- Resume active round works from Home/Resume entry points.
- Finish → recap renders and analytics fire.
- Round analytics events fire for both flag states.

## Rollout telemetry to monitor

Track these events (mobile analytics) during staged rollout. Investigate if any metric deviates from baseline or exceeds the thresholds below:

- `roundflowv2_flag_evaluated`
  - Emitted once per Home mount; use `roundFlowV2Enabled` + `roundFlowV2Reason` to segment exposure by allowlist/percent/force.
- `roundflowv2_home_card_impression` + `roundflowv2_home_cta_tap`
  - CTA tap-through should remain stable; large drops (>20%) indicate UI or loading regressions.
  - `roundflowv2_home_cta_blocked_loading` should be rare and short-lived; spikes indicate hydrate stalls.
- `roundflowv2_active_round_hydrate_start` / `roundflowv2_active_round_hydrate_success` / `roundflowv2_active_round_hydrate_failure`
  - Failure rate >2% or sustained p95 duration >3s is a rollback signal.
  - Check `source` to see cached vs remote behavior shifts.
- `roundflowv2_start_round_request` / `roundflowv2_start_round_response`
  - HTTP error rate >1% or large increases in `durationMs` are suspect.
  - Monitor `reusedActiveRound` rate to ensure idempotent start is working.

All RoundFlowV2 telemetry now includes `roundFlowV2Reason` (falls back to `unknown`) to segment dashboards by rollout decision.

## Rollout control

- Defaults: set `ROUND_FLOW_V2_ROLLOUT_PERCENT=0` to keep the feature off by default.
- Allowlist internal testers with `ROUND_FLOW_V2_ALLOWLIST` (comma-separated member ids).
- Ramp in stages: `1% → 5% → 20% → 50% → 100%` once telemetry stays within guardrails.
- Roll back instantly by setting `ROUND_FLOW_V2_FORCE=off` (or `ROUND_FLOW_V2_ROLLOUT_PERCENT=0`).
- Force-enable for QA with `ROUND_FLOW_V2_FORCE=on` when needed.

## QA verification

- Use the **Feature Flags Debug** screen to force `roundFlowV2` ON/OFF for a test account.
- With `roundFlowV2` **OFF**:
  - Home shows legacy start/resume UI and behavior is unchanged.
- With `roundFlowV2` **ON**:
  - Home shows start/continue card correctly.
  - CTA is disabled during hydrate; taps while loading should not navigate.
  - Start is idempotent: if an active round exists, the flow resumes and `reusedActiveRound` is returned.
  - Verify StartRoundV2 and HomeDashboard quick-start paths both create/resume correctly.

## Entry & Resume verification

- Force-enable `roundFlowV2` for a test user via the feature flag overrides (server admin → set rollout to 100% or a user-specific allow list).
- On mobile Home, confirm the "Continue round" card appears when an active round exists and opens RoundShot for that round.
- With no active round, confirm the Home card shows "Start round" and routes to StartRoundV2.
- While active-round lookup is still loading, verify the Home CTA stays disabled so a duplicate round cannot be started during hydrate.
- Attempt to start a new round while an active round exists: the app should resume the existing round instead of creating another.
- Roll back by setting the `roundFlowV2` rollout to 0% when verification is complete.
