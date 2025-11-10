# Commentary Queue Admin Overview

The commentary queue enables event hosts to request AI-generated clip commentary and review status across all clips.

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/events/{event_id}/clips` | Lists commentary records for the event. Supports optional `status` query filtering. Requires `x-event-role: admin`. |
| `GET` | `/clips/{clip_id}/commentary` | Returns the latest commentary payload for the given clip. Requires admin headers. |
| `POST` | `/clips/{clip_id}/commentary/play` | Records telemetry when a host plays the generated TTS audio. |
| `POST` | `/events/clips/{clip_id}/commentary` | Enqueues commentary generation and now mirrors queue status transitions plus safe gating. |

All endpoints require the API key headers when enabled and enforce the admin guard.

## Status Lifecycle

Commentary records transition through the following states:

1. `queued` – host requested commentary and the job was accepted.
2. `running` – generation has started.
3. `ready` – commentary completed (includes `title`, `summary`, and optional `ttsUrl`).
4. `failed` – generation failed; details are reset.
5. `blocked_safe` – request denied while tournament-safe mode is active.

The in-memory repository keeps timestamps (`updatedTs`) for ordering and polling.

## Tournament-safe Gating

- When tournament-safe is active, the enqueue endpoint returns `423 Locked`, sets the status to `blocked_safe`, and the UI disables the request button with a banner.
- The admin UI also disables request actions whenever `status` is `queued` or `running` to avoid duplicate jobs.

## Telemetry Events

Commentary telemetry uses the `clip.commentary.{state}` namespace:

- `clip.commentary.request`
- `clip.commentary.running`
- `clip.commentary.done`
- `clip.commentary.failed`
- `clip.commentary.blocked_safe`
- `clip.commentary.play_tts`

Payloads include `eventId`, `clipId`, `ts`, and contextual fields such as `memberId`, `hasTts`, or `error` depending on the state.
