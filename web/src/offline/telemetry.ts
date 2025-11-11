import { postTelemetryEvent } from "../api";

export type QueueTelemetryEvent =
  | "queue.enqueued"
  | "queue.sent"
  | "queue.retry"
  | "queue.fail"
  | "queue.drain";

type QueueTelemetryPayload = Record<string, unknown>;

function sanitize(payload: QueueTelemetryPayload): QueueTelemetryPayload {
  const cleaned: QueueTelemetryPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  cleaned.ts = Date.now();
  return cleaned;
}

export function emitQueueTelemetry(
  event: QueueTelemetryEvent,
  payload: QueueTelemetryPayload,
): void {
  try {
    void postTelemetryEvent({ event, ...sanitize(payload) }).catch((error) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(`[offline/telemetry] failed to emit ${event}`, error);
      }
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[offline/telemetry] emitter threw for ${event}`, error);
    }
  }
}
