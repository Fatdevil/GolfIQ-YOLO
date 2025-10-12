# Offline Course Bundle Endpoint

The offline bundle API delivers pre-generated geometry for clients that need to hydrate AR overlays without a network round trip. The endpoint is additive and RC/flag-gated.

## Route

```
GET /bundle/course/{courseId}
```

### Response

```json
{
  "courseId": "demo-course",
  "version": 1,
  "ttlSec": 604800,
  "features": {
    "fairways": [ /* optional */ ],
    "greens": [ /* optional */ ],
    "bunkers": [ /* optional */ ],
    "hazards": [ /* optional */ ]
  }
}
```

* `ttlSec` is sourced from remote config/environment (`bundle.ttlSeconds`) with a 7-day default.
* `features` mirrors the JSON stored at `data/courses/{courseId}.json`. Missing files return an empty array.

## Caching

Responses include:

* `ETag: W/"{hash16}"` — a SHA-256 hash of the payload truncated to 16 hex characters.
* `Cache-Control: public, max-age={ttlSec}` — clients should respect the TTL for local caching.

Clients should persist the payload keyed by `courseId` and revalidate when:

1. The TTL expires (schedule a refresh before the round starts).
2. The weak ETag changes (compare stored vs. new headers).

For fully offline play, cache the latest bundle plus ETag locally; when connectivity returns, make a conditional request with `If-None-Match` to avoid re-downloading unchanged bundles.
