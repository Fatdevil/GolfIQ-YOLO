# Edge performance hardening – signed HLS + presign v2

This release introduces an authenticated signing service for HLS playback URLs
and a leaner presign contract for uploads. The goals are to keep clip playback
fast on the edge, reduce exposure of long-lived URLs, and simplify the amount of
metadata required to start uploads from the web client.

## HLS signing service

* **Endpoint:** `GET /media/sign?path=/hls/{clip}/master.m3u8&ttl=900`
* **Response:** `{ "url": "<base><path>?exp=...&sig=...", "exp": <unix_ts> }`
* **Algorithm:** HMAC-SHA256 over `"{path}:{exp}"` with a per-environment
  secret.
* **TTL:** clamped to 60–3600 seconds on the server. Clients may omit the
  `ttl` query to accept the default 15 minutes.

### Required environment variables

| Variable | Description |
| --- | --- |
| `HLS_SIGN_KEY` | Secret used for the HMAC signature. Must be set for signing to work. |
| `HLS_BASE_URL` | Base URL prepended to the signed path. Defaults to `/static`. |

On the client, configure the playback base via `VITE_HLS_BASE`. This should
match the CDN origin (for example `https://cdn.example.com`). When unset the web
client falls back to `/static` so that local development continues to work.

## Web player integration

The clip viewer fetches a signed URL immediately before assigning
`video.src`. If signing fails (e.g. `HLS_SIGN_KEY` is missing in a developer
environment) the component reverts to the original, unsigned URL. Playback is
instrumented with telemetry events:

* `media.play.requested` when the user presses play
* `media.play.signed` once the browser can start playback (includes
  `play_start_ms`)
* `media.play.failed` when playback errors before starting

These events surface p95 start latency in telemetry dashboards.

## Upload presign v2

`POST /runs/upload-url?version=v2` now returns a compact schema:

```json
{
  "url": "https://s3.example.com/upload",
  "fields": {
    "key": "run-slug/1234.zip",
    "contentType": "application/zip"
  }
}
```

The legacy response is still available when `version` is omitted (or explicitly
set to `v1`) to preserve backward compatibility. Enable v2 globally by setting
`UPLOAD_PRESIGN_VERSION=v2` on the server.

## Summary of flags

* `HLS_SIGN_KEY` – enables signing (required outside local dev)
* `HLS_BASE_URL` – absolute or relative base for signed playback URLs
* `VITE_HLS_BASE` – client-side base used to derive signable paths
* `UPLOAD_PRESIGN_VERSION` – server default (`v1` or `v2`)
