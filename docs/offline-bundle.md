# Offline Course Bundle Endpoint

The `/bundle/course/{course_id}` route provides a minimal JSON contract for shipping precomputed course geometry to offline AR clients. The endpoint is currently additive and remains hidden behind feature flag checks in consuming applications.

## Response Shape

```json
{
  "courseId": "sunny-ridge",
  "version": 1,
  "ttlSec": 604800,
  "features": [
    {"type": "fairways", "features": [...]},
    {"type": "greens", "features": [...]},
    {"type": "bunkers", "features": [...]},
    {"type": "hazards", "features": [...]}
  ]
}
```

- `features` is optional; when present it contains type-tagged feature lists. If no bundle file exists, the array is empty.
- `version` tracks schema revisions (initially `1`).
- `ttlSec` reflects the cache TTL derived from remote config or environment overrides.

## Headers and Caching

The server issues strong caching hints for clients:

- **ETag** — `W/"<sha256[:16]>"` computed from the serialized JSON payload.
- **Cache-Control** — `public, max-age=<ttlSec>`.

Clients should memoize bundles locally using both TTL and ETag:

1. Cache the payload for up to `ttlSec` seconds.
2. When refreshing, send `If-None-Match` with the previous weak ETag. A matching digest allows the server to short-circuit with `304 Not Modified`.
3. If the TTL expires without connectivity, fall back to the cached payload until the next online refresh succeeds.

## Storage Layout

Bundles are resolved from `data/courses/<course_id>.json` (configurable via `BUNDLE_DATA_DIR`). Missing or malformed files simply return an empty `features` array to keep the contract stable for downstream consumers.
