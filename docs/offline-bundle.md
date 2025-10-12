# Offline Bundle API

## Contract
- `GET /bundle/course/{courseId}`
  - Response body: `{ courseId, version: 1, ttlSec, features, ...overrides }`.
  - Optional overrides read from `data/courses/{courseId}.json` when present.
  - Default `features` sourced from configuration (`OFFLINE_BUNDLE_FEATURES`).

## Caching Semantics
- Weak ETag (`W/"<hash16>"`) generated from the canonical JSON payload.
- `Cache-Control: public, max-age=<ttlSec>` exposes the configured TTL to clients and proxies.
- Stable hashing guarantees consistent caching unless the payload changes.

## Client Guidance
- Cache responses for `ttlSec` seconds; refresh sooner if ETag mismatch occurs.
- Persist optional course overrides offline to avoid bundling binary assets in the repo.
