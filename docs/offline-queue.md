# Web offline queue

The web client persists pending uploads and score submissions in IndexedDB so
they can resume automatically when the tab regains connectivity. The queue
processes two job types:

* **upload** – requests a v2 presign URL via `/runs/upload-url`, uploads the
  clip with exponential backoff (2s–2m + jitter), and optionally finalizes the
  run metadata.
* **score** – POSTs to `/events/{id}/score` with an idempotency header so
  duplicate retries are ignored by the server.

Jobs are stored under `offline.queue.jobs.v1` using [`idb-keyval`](https://www.npmjs.com/package/idb-keyval).
State transitions emit `queue.*` telemetry events to the existing telemetry
endpoint for observability.

The queue starts automatically from `bootstrap/offline.ts` when the app loads.
Listeners hook into `online`/`offline`, `visibilitychange`, and a 10s poll to
resume processing when the browser is foregrounded and online.

### UI indicator

`QueueIndicator` in the top navigation shows pending count, last error, and a
manual “Retry now” action. Errors remain visible until dismissed so operators
know why a job stalled (for example, permanent 4xx responses).

### Testing

Vitest covers:

* Queue persistence, backoff, and drain behavior (`tests/offline_queue.spec.ts`)
* Upload retries and presign refresh logic (`tests/upload_worker.spec.ts`)
* Score worker idempotency header handling (`tests/score_worker.spec.ts`)

