import { postTelemetryEvent } from '@web/api';

type Payload = Record<string, unknown>;

export function emitTelemetry(event: string, payload: Payload): void {
  void postTelemetryEvent({ event, ...payload, source: 'web', ts: Date.now() }).catch((error) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[share/telemetry] failed to emit ${event}`, error);
    }
  });
}
