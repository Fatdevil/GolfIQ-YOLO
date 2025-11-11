# Live Pilot (Tee Cam → HLS)

This pilot wires the event "tee cam" feed through a minimal HLS pipeline with admin start/stop controls and signed viewer access.

## Server configuration

Set the following environment variables for the FastAPI service:

| Variable | Required | Description |
| --- | --- | --- |
| `LIVE_VIEWER_SIGN_KEY` | ✅ | HMAC signing key for viewer tokens and /live/status verification |
| `LIVE_STREAM_DATA_DIR` | ➖ | Optional directory for JSONL audit logs (defaults to `data/live`) |
| `LIVEKIT_WHIP_URL` | ➖ | WHIP ingest endpoint when a real LiveKit source is used (not needed for `source="mock"`) |

The live lifecycle is managed by `server/services/live_stream.py`. State transitions are stored in memory and appended to `streams.jsonl` under the data directory. Viewer token minting is handled by `server/services/viewer_token.py` and requires the signing key above.

### Telemetry

The service emits these events via `server/services/telemetry.py`:

- `live.start` / `live.stop`
- `live.token`
- `live.status`
- `live.viewer_join`

## API surface

All routes are mounted under `/events/{event_id}/live` and require the existing API key header.

| Method & Path | Auth | Notes |
| --- | --- | --- |
| `POST /start` | Admin | Starts the stream. When `source="mock"` it exposes `samples/hls/tee/` fixtures for local testing. |
| `POST /stop` | Admin | Stops the stream and clears the viewer registry. |
| `POST /token` | Admin | Mints an expiring viewer token (`ttl` seconds, default 900). Only allowed while live. |
| `GET /status?token=…` | Token optional | Returns `{running, startedAt}` and, when the token verifies, `hlsPath`. |

Clients can continue to sign the returned HLS path via `GET /media/sign?path=/hls/...`.

## Web client flows

Two event routes are exposed in the React app:

- `/events/:id/live-host` – Admin control surface (start/stop, viewer link minting and clipboard helper).
- `/events/:id/live-view` – Viewer page. Reads the `token` query string, polls live status via `useLivePlayback`, signs playback URLs, and emits `live.viewer_join` telemetry once playback becomes available.

The reusable `useLivePlayback` hook (in `web/src/features/live/useLivePlayback.ts`) handles polling, token minting for admins, and signed URL lookup through the existing media signer API.

## Testing & coverage

Server tests (`pytest -q server/tests --cov=server --cov-report=xml`) cover guard rails, singleton behaviour, and signer integration. Vitest suites validate the host/viewer pages along with the live playback hook. Run the full check list from the project root:

```bash
black --check .
flake8 .
pytest -q server/tests --cov=server --cov-report=xml
npm --prefix web run typecheck
npm --prefix web run test
```

These commands ensure coverage stays above baseline and that the new live telemetry is exercised end-to-end.
