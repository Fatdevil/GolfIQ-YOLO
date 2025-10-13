# Offline Bundle API

## Response Contract

`GET /bundle/course/{courseId}` returns JSON:

```json
{
  "courseId": "<string>",
  "version": 1,
  "ttlSec": <int>,
  "features": [
    // GeoJSON feature fragments if available, otherwise []
  ]
}
```

The payload always includes the requested `courseId` and a monotonically increasing `version` identifier for offline clients.

## Headers

- `ETag`: Weak validator in the format `W/"<sha16>"` computed from the response payload.
- `Cache-Control`: `public, max-age=<ttlSec>` to align browser caches and CDN behaviour with server TTL.

## Caching Guidance

- Respect the `ttlSec` value when scheduling bundle refreshes. When the TTL is overridden via environment or remote config, downstream caches automatically inherit the new duration.
- Weak ETags allow conditional requests; clients should send `If-None-Match` with the previous ETag to receive `304 Not Modified` when content is unchanged.
