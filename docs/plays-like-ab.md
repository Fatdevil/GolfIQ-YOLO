# Plays-Like A/B Controls

This document outlines how to stage the Plays-Like experience by tier and how to safely roll it back using the new remote config keys.

## Rollout: Tier A Only

1. Fetch the current remote config snapshot and note the active `etag`.
2. Modify only the `tierA` section to enable the feature and opt into the `v1` UI while leaving other tiers unchanged:

```json
{
  "tierA": {
    "playsLikeEnabled": true,
    "ui": { "playsLikeVariant": "v1" }
  }
}
```

3. POST the delta to `/config/remote` with the admin token. The server merges the update with existing keys (distance model, analytics, etc.).
4. Validate telemetry:
   * `plays_like_assign` should report `variant: "v1"`, `tier: "tierA"` and the active coefficients.
   * Opening the QA drawer should emit `plays_like_ui` events.
5. Monitor Tier A devices; Tier B/C will continue to receive `variant: "off"` and will not surface the panel.

## Rollback

1. Prepare a payload that either switches the variant back to `"off"` or disables the feature entirely:

```json
{
  "tierA": {
    "playsLikeEnabled": false,
    "ui": { "playsLikeVariant": "off" }
  }
}
```

2. POST the change with the admin token. Clients revert immediately on the next config poll.
3. Confirm `plays_like_assign` now reports `variant: "off"` for Tier A and that the QA drawer telemetry stops.

> **Tip:** Keep the config changes scoped (only the keys shown above) to avoid unintentionally overriding unrelated settings. The server applies defaults for untouched tiers and nested plays-like tuning data.
