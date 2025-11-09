export type TelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

let emitter: TelemetryEmitter | null = null;

export function setTelemetryEmitter(candidate: TelemetryEmitter | null | undefined): void {
  emitter = typeof candidate === 'function' ? candidate : null;
}

export function safeEmit(event: string, payload: Record<string, unknown>): void {
  if (!emitter) {
    return;
  }
  try {
    emitter(event, payload);
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/telemetry] emit failed', error);
    }
  }
}
