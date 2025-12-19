# Round Flow v2 Rollout Playbook

## Purpose
This playbook makes the Round Flow v2 rollout measurable, repeatable, and low-risk by standardizing rollout reasons and providing explicit guardrails, monitoring, and rollback steps.

## Stable rollout reasons
All Round Flow v2 telemetry must emit one of the following low-cardinality reasons:

- `allowlist`
- `percent`
- `force_on`
- `force_off`
- `default_off`
- `unknown`

If a raw reason is missing or empty, default to `unknown`. If a raw reason is unrecognized, normalize it to `unknown` (do not emit raw values).

## Rollout ladder
Progress only after guardrails are green for the prior step.

1. **0%** (default off)
2. **Allowlist** (QA/internal)
3. **1%**
4. **5%**
5. **20%**
6. **50%**
7. **100%**

## Controls
Server-side environment variables (fallback defaults if no remote config is set):

- **Percent rollout**: `ROUND_FLOW_V2_ROLLOUT_PERCENT` (alias: `ROUND_FLOW_V2_ROLLOUT_PCT`)
- **Allowlist**: `ROUND_FLOW_V2_ALLOWLIST` (comma-separated member IDs)
- **Force**: `ROUND_FLOW_V2_FORCE` (`on`/`off`)

### Remote rollout config (preferred)
Set `ADMIN_TOKEN` on the server and use the admin endpoints to persist rollout changes
without redeploying. All admin requests require `X-Admin-Token: $ADMIN_TOKEN`.

#### Read current config
```bash
curl -sS \\
  -H "X-Admin-Token: $ADMIN_TOKEN" \\
  http://localhost:8000/api/admin/feature-flags/config
```

#### Set rollout percent
```bash
curl -sS -X PUT \\
  -H "Content-Type: application/json" \\
  -H "X-Admin-Token: $ADMIN_TOKEN" \\
  -d '{"roundFlowV2":{"rolloutPercent":5}}' \\
  http://localhost:8000/api/admin/feature-flags/config
```

#### Add/remove allowlist member
```bash
curl -sS -X POST \\
  -H "Content-Type: application/json" \\
  -H "X-Admin-Token: $ADMIN_TOKEN" \\
  -d '{"memberId":"member-123"}' \\
  http://localhost:8000/api/admin/feature-flags/roundFlowV2/allowlist:add

curl -sS -X POST \\
  -H "Content-Type: application/json" \\
  -H "X-Admin-Token: $ADMIN_TOKEN" \\
  -d '{"memberId":"member-123"}' \\
  http://localhost:8000/api/admin/feature-flags/roundFlowV2/allowlist:remove
```

#### Force on/off or unset
```bash
curl -sS -X PUT \\
  -H "Content-Type: application/json" \\
  -H "X-Admin-Token: $ADMIN_TOKEN" \\
  -d '{"roundFlowV2":{"force":"force_on"}}' \\
  http://localhost:8000/api/admin/feature-flags/config

curl -sS -X PUT \\
  -H "Content-Type: application/json" \\
  -H "X-Admin-Token: $ADMIN_TOKEN" \\
  -d '{"roundFlowV2":{"force":"force_off"}}' \\
  http://localhost:8000/api/admin/feature-flags/config

curl -sS -X PUT \\
  -H "Content-Type: application/json" \\
  -H "X-Admin-Token: $ADMIN_TOKEN" \\
  -d '{"roundFlowV2":{"force":null}}' \\
  http://localhost:8000/api/admin/feature-flags/config
```

## Telemetry to monitor
Use `roundflowv2_flag_evaluated` as the denominator for enabled/disabled counts.

### Events
- `roundflowv2_flag_evaluated`
- `roundflowv2_home_card_impression`
- `roundflowv2_home_cta_tap`
- `roundflowv2_home_cta_blocked_loading`
- `roundflowv2_active_round_hydrate_start`
- `roundflowv2_active_round_hydrate_success`
- `roundflowv2_active_round_hydrate_failure`
- `roundflowv2_start_round_request`
- `roundflowv2_start_round_response`

### Required fields
Segment every query by:

- `roundFlowV2Enabled`
- `roundFlowV2Reason` (stable values above)

Where applicable, also use:

- `durationMs`
- `httpStatus`
- `errorType`
- `reusedActiveRound`
- `source`

## Guardrails and rollback criteria
Use conservative thresholds for early steps. If any guardrail is breached, pause the rollout or roll back to the previous step.

### Suggested guardrails
- **Start round response error rate** (`httpStatus >= 400`) for enabled users
- **Active round hydrate failure rate** (`roundflowv2_active_round_hydrate_failure` / `roundflowv2_active_round_hydrate_start`)
- **p95 duration** for:
  - `roundflowv2_active_round_hydrate_success.durationMs`
  - `roundflowv2_start_round_response.durationMs`
- **CTA blocked tap rate** (`roundflowv2_home_cta_blocked_loading` / `roundflowv2_home_cta_tap`)

### Rollback / kill switch
- Set `force_off` via the admin config (preferred) or `ROUND_FLOW_V2_FORCE=off` to disable for all users.
- Optionally set `rolloutPercent=0` and clear the allowlist to return to default-off.

## QA verification checklist
1. **Allowlist smoke test**
   - Add your member ID to `ROUND_FLOW_V2_ALLOWLIST` and confirm Round Flow v2 is enabled.
   - Verify `roundflowv2_flag_evaluated` emits `roundFlowV2Reason=allowlist`.
2. **Percent rollout check**
   - Set `ROUND_FLOW_V2_ROLLOUT_PERCENT=1` with empty allowlist and confirm only a small percent is enabled.
   - Verify `roundflowv2_flag_evaluated` emits `roundFlowV2Reason=percent` for enabled users.
3. **Force off kill switch**
   - Set `ROUND_FLOW_V2_FORCE=off` and confirm Round Flow v2 is disabled.
   - Verify `roundflowv2_flag_evaluated` emits `roundFlowV2Reason=force_off`.
4. **Unknown reason fallback**
   - Validate that missing or unrecognized reasons are emitted as `roundFlowV2Reason=unknown`.

## Rollout notes
- Do not change Round Flow v2 UX or business logic during rollout.
- Use the telemetry events above as the single source of truth for decisioning.
