# Home Feed Overview

The home feed surfaces ranked Top Shots alongside currently running live events. It is consumed by the web client and exposed via a FastAPI endpoint that supports caching.

## API contract

`GET /feed/home?limit=20`

Returns JSON:

```
{
  "topShots": [
    {
      "clipId": "c1",
      "eventId": "evt-123",
      "sgDelta": 0.62,
      "reactions1min": 3,
      "reactionsTotal": 17,
      "createdAt": "2024-01-02T12:30:00Z",
      "anchorSec": 8,
      "rankScore": 2.41
    }
  ],
  "live": [
    {
      "eventId": "evt-live",
      "viewers": 12,
      "startedAt": "2024-01-02T12:00:00Z",
      "livePath": "/hls/evt-live/master.m3u8"
    }
  ],
  "updatedAt": "2024-01-02T12:30:00Z",
  "etag": "<hex>"
}
```

Top shots are sourced from the in-memory clip store and ranked via `server.services.ranking.rank_top_shots`. Live entries are populated when `server.services.live_stream.list_running_events()` reports an active stream. The optional `limit` query parameter is clamped to `[5, 50]` before applying.

### Caching

- Responses include `ETag` and `Cache-Control: public, max-age=60`.
- The handler keeps a 60-second in-memory snapshot. Clients may send `If-None-Match` to receive `304 Not Modified` when the cached snapshot is valid.

### Telemetry

- `feed.home.requested` – emitted on every request with the resolved `limit`.
- `feed.home.served` – emitted when a payload is returned, includes `topCount` and `liveCount`.
- `feed.click.clip` – fired by the web client when a Top Shot CTA is used (includes `clipId`, `eventId`, `anchorSec`).
- `feed.click.watch` – fired when a Live Now card routes to the viewer.
- `feed.home.rendered` – emitted by the web client once the lists are rendered (counts mirror the payload sizes).

## Web experience

- `/` and `/feed` render `HomeFeed`, while the previous Analyze page is now at `/analyze`.
- Top Shot cards display SGΔ badges, reaction counts, and a “Play from anchor” CTA that deep-links to the event’s Top Shots view with `?clip=<id>&t=<seconds>`.
- Live Now cards highlight active streams (● LIVE) and link to `/events/:id/live-view?source=feed` via a Watch button.
- Users can manually refresh; skeleton placeholders cover loading states, and empty states explain when no content is available.

Both the server and web layers respect the ETag contract, ensuring the second call within the TTL reuses cached data without re-rendering.
