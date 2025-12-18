# Round Flow v2 Launch Checklist

Use this checklist when toggling `roundFlowV2` via the remote rollout:

- **Flag ON**: new flow start/resume/end works without errors.
- **Flag OFF**: legacy round flow remains unchanged.
- Resume active round works from Home/Resume entry points.
- Finish → recap renders and analytics fire.
- Round analytics events fire for both flag states.

## Entry & Resume verification

- Force-enable `roundFlowV2` for a test user via the feature flag overrides (server admin → set rollout to 100% or a user-specific allow list).
- On mobile Home, confirm the "Continue round" card appears when an active round exists and opens RoundShot for that round.
- With no active round, confirm the Home card shows "Start round" and routes to StartRoundV2.
- While active-round lookup is still loading, verify the Home CTA stays disabled so a duplicate round cannot be started during hydrate.
- Roll back by setting the `roundFlowV2` rollout to 0% when verification is complete.
