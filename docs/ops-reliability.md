# Ops Reliability Enhancements

## Durable Upload Queue

- The shared uploader (`shared/runs/uploader.ts`) now persists each task with a 30-minute TTL and a retry cap (6 attempts).
- Uploads pause automatically while offline and resume when connectivity returns. Queue state is exposed via `subscribeToUploadQueueSummary` for UI surfaces.
- Reliability events emitted include queueing, retries, successes, and terminal failures. Tests cover restart persistence, exponential backoff, and offline resume logic.
- QA launcher shows a compact badge with pending uploads and renders reliability cards for offline mode and retry notifications.

## Edge Model Watchdog

- `ensureModel` writes last-known-good metadata (`last-good.json`) alongside cached binaries.
- Download or verification failures emit telemetry (`edge.model.init_failed`) and reliability events, then attempt to fall back to the recorded model (`edge.model.fallback_used`).
- Fallback choices are surfaced to QA operators via reliability cards, and telemetry sinks can subscribe via the global `__EDGE_MODEL_TELEMETRY__` hook.

## Issue Reporting Flow

- QA launcher header includes a “Report issue” action that packages:
  - Last 5 minutes of reliability events
  - Current upload queue snapshot
  - Sanitized RC flags and device/app metadata (via `expo-device` / `expo-constants`)
- Reports POST to `/issues`, which stores JSONL payloads under `data/issues/YYYY-MM-DD.jsonl` and returns a unique ID to display in-app.

## Server-Side Issue Intake

- FastAPI route `/issues` enforces API-key auth, appends JSON lines per day, and serves GET `/issues/{id}` for triage.
- Upload endpoints log structured failures to `data/runs/failed/YYYY-MM-DD.jsonl` whenever validation or persistence errors occur.
- Daily GitHub Action (`.github/workflows/triage-digest.yml`) aggregates counts of new issues and failed uploads, posting a digest comment to the “Ops digest” GitHub issue.

## Inspecting Field Data

1. **Issue reports**: tail the relevant JSONL file, e.g. `jq . data/issues/2025-03-14.jsonl`.
2. **Upload failures**: examine `data/runs/failed/<date>.jsonl` for per-kind reasons.
3. **Model fallbacks**: review reliability event logs collected via QA reports or telemetry sinks.
4. **Ops digest**: track daily summaries on the “Ops digest” issue for quick triage metrics.
