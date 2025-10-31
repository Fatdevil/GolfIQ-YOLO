# Course Bundle QA Client v1

This document describes the deterministic course bundle client introduced for the QA HUD. The client keeps offline bundles fresh with TTL + ETag semantics, validates bundle integrity, and stores payloads in an AsyncStorage-backed LRU cache.

## Wire Protocol

* **Manifest endpoint**: `GET /bundle/course/{courseId}/manifest.json`
  * Fields:
    * `id`: course identifier.
    * `v`: monotonically increasing bundle version.
    * `etag` (optional): server provided entity tag.
    * `updatedAt`: epoch milliseconds when the manifest was generated.
    * `ttlSec`: seconds of freshness.
    * `sha256` (optional): base64 SHA-256 digest of the bundle payload.
    * `sizeBytes`: expected bundle size in bytes.
    * `holes`: list of `{ id, v, len }` hole references.
* **Bundle endpoint**: `GET /bundle/course/{courseId}/bundle.bin`
  * Raw binary payload referenced by the manifest.
  * The client only accepts a payload whose SHA-256 digest matches the manifest `sha256` value when provided.

Manifests are requested with `If-None-Match` when an ETag is present. A `304 Not Modified` response extends the cached manifest’s `updatedAt` and retains the existing bundle. Any `200 OK` response replaces the manifest only after the new bundle payload is verified.

## Freshness & Revalidation

* The client treats a bundle as **fresh** while `now <= updatedAt + ttlSec * 1000`.
* When TTL expires the client serves the cached bundle as **stale** and immediately revalidates in the same call. Successful revalidation updates the manifest and bundle while the caller still receives a `stale` status (SWR semantics).
* `refresh()` bypasses TTL checks but still uses ETag negotiation to avoid unnecessary downloads.

## Integrity Guarantees

* Bundle payloads are hashed with SHA-256. WebCrypto is used when available; otherwise a deterministic pure TypeScript implementation runs on all platforms.
* If the computed digest differs from the manifest `sha256`, the download is marked **invalid** and the previous manifest + bundle remain untouched.
* Network or parse failures return an **error** status while keeping the prior cache entry.

## Offline LRU Store

* Bundles are persisted through an AsyncStorage-backed LRU store (`BundleStore`).
* Configuration defaults: 150 MB `maxBytes`, 120 MB `highWatermark`.
* `set()` evicts the least-recently-used bundles until the cache is under the high watermark. Oversized payloads (larger than `maxBytes`) are discarded.
* Metadata contains per-key byte counts so `stat()` can report usage without reading payloads.

## QA HUD Row

The HUD now displays a compact bundle row:

```
Bundle: Fresh · v12 · 38.4 MB (ETag abc123)
```

* `Fresh` / `Stale` / `Invalid` / `Missing` / `Error` map directly to client statuses.
* When the status is `stale`, `invalid`, or `error` the row surfaces a `⚠️ Tap to refresh` hint. The touch target invokes `refresh()`.

## Service-Level Objectives

* Manifest fetch latency: ≤ **300 ms**.
* `ensure()` warm-cache p95: ≤ **1.2 s** (includes revalidation when stale).
* Integrity mismatches: **0** tolerated. Any mismatch is reported immediately and the old bundle is retained.

## Troubleshooting

| Symptom | Notes |
| --- | --- |
| `status = stale` repeatedly | Verify server TTLs are reasonable. A 304 will update `updatedAt`; check that the server honors `If-None-Match`. |
| `status = invalid` | The bundle payload’s SHA-256 digest differed from the manifest. Inspect the build pipeline for corruption. |
| `status = error` | Network failure or manifest parse issue. The previous bundle remains cached; use the QA refresh action after resolving the outage. |
| Missing bundle despite 304 | A 304 with no cached payload triggers a bundle re-download. If the download fails, the manifest is reverted and the status reports `error`. |

