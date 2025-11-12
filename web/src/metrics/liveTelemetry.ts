import { postTelemetryEvent } from '@web/api';

function logTelemetryError(context: string, error: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn(`[live/telemetry] ${context} failed`, error);
}

export async function emitLiveViewStart({
  eventId,
  streamId,
  play_start_ms,
}: {
  eventId: string;
  streamId: string | null;
  play_start_ms: number;
}): Promise<void> {
  try {
    await postTelemetryEvent({
      event: 'live.view.start',
      eventId,
      streamId: streamId ?? undefined,
      play_start_ms,
    });
  } catch (error) {
    logTelemetryError('start', error);
  }
}

export async function emitLiveViewEnd({
  eventId,
  dur_ms,
}: {
  eventId: string;
  dur_ms: number;
}): Promise<void> {
  try {
    await postTelemetryEvent({
      event: 'live.view.end',
      eventId,
      dur_ms,
    });
  } catch (error) {
    logTelemetryError('end', error);
  }
}

export async function emitLiveViewReconnect({
  eventId,
  attempt,
  reason,
}: {
  eventId: string;
  attempt: number;
  reason: string;
}): Promise<void> {
  try {
    await postTelemetryEvent({
      event: 'live.view.reconnect',
      eventId,
      attempt,
      reason,
    });
  } catch (error) {
    logTelemetryError('reconnect', error);
  }
}

export async function emitLiveViewError({
  eventId,
  code,
  details,
}: {
  eventId: string;
  code: string;
  details: string;
}): Promise<void> {
  try {
    await postTelemetryEvent({
      event: 'live.view.error',
      eventId,
      code,
      details,
    });
  } catch (error) {
    logTelemetryError('error', error);
  }
}
