# Feature Flags Remote Rollout v1

This playbook describes how to drive the **practiceGrowthV1** and **roundFlowV2** feature flags remotely via the `/api/feature-flags` endpoint.

## Environment variables

Set rollout percentages (0-100):

- `PRACTICE_GROWTH_V1_ROLLOUT_PCT`
- `ROUND_FLOW_V2_ROLLOUT_PCT`

Optional kill-switch overrides (case-insensitive):

- `PRACTICE_GROWTH_V1_FORCE=on|off`
- `ROUND_FLOW_V2_FORCE=on|off`

Force values win over rollout percentages. Percentages are deterministic per user, using a stable hash of `flagName:userId` → bucket `0..99` and enabling when `bucket < rolloutPct`.

## Staged rollout recipe

1. Start at `0` to keep everyone on the legacy path.
2. Increase to `1`% and validate logs + crash-free sessions.
3. Step to `10`%, then `25`%, then `50%` as metrics hold.
4. Move to `100%` once telemetry and support signals are stable.

## Health and metrics to watch

- Entry/start/resume rates for practice and rounds.
- Round start/resume success rate.
- Sharing/recap completion.
- Crash-free sessions and latency around gated screens.
- Feature gating/loaded analytics (`feature_flags_loaded`).

## Rollback plan

- Immediate: set the rollout percentage to `0` for the affected flag.
- Hard kill: set `*_FORCE=off` to disable regardless of rollout percentage.
- Clients cache the last known payload and fall back to env/local defaults if the endpoint is unavailable.
- Mobile refreshes remote flags when returning to the foreground with a 10-minute TTL to pick up changes quickly without
  spamming the API.

## Verifying on a device

- Open the hidden **Feature Flags Debug** screen by tapping the Home title seven times.
- Review the top metadata card for the current user id, the last successful fetch timestamp, and whether the cached values are
  still fresh under the 10-minute TTL.
- Use **Refresh now** to bypass the TTL and fetch the latest payload, and **Clear cache** to wipe the per-user cache for
  first-launch testing.
- Tap **Copy JSON** to grab the current effective flags (including source/freshness) for quick sharing in Slack.
- In dev builds, you can toggle per-flag local overrides to validate experiences without changing the server payload. Overrides
  are read-only in production builds.
