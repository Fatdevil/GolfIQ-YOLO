import type { Event, Participant, UUID } from './types';

type EventsTelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

let emitter: EventsTelemetryEmitter | null = null;

export function setEventsTelemetryEmitter(candidate: EventsTelemetryEmitter | null | undefined): void {
  emitter = typeof candidate === 'function' ? candidate : null;
}

function emit(event: string, payload: Record<string, unknown>): void {
  if (!emitter) {
    return;
  }
  try {
    emitter(event, payload);
  } catch (error) {
    console.warn('[events/telemetry] emitter failed', error);
  }
}

export function recordEventCreated(event: Event): void {
  emit('event.created', {
    eventId: event.id,
    code: event.code,
    name: event.name,
    start_at: event.start_at ?? null,
  });
}

export function recordEventJoined(event: Event, participant: Participant): void {
  emit('event.joined', {
    eventId: event.id,
    userId: participant.user_id,
    displayName: participant.display_name,
  });
}

export function recordEventAttachedRound(eventId: UUID, userId: UUID, roundId: UUID): void {
  emit('event.attachedRound', {
    eventId,
    userId,
    roundId,
  });
}

export function recordScoreUpserted(eventId: UUID, userId: UUID, hole: number, gross: number): void {
  emit('event.score.upserted', {
    eventId,
    userId,
    hole,
    gross,
  });
}

export function recordScoreFailed(eventId: UUID | null, roundId: UUID | null, error: unknown): void {
  emit('event.score.failed', {
    eventId,
    roundId,
    message: error instanceof Error ? error.message : String(error ?? 'unknown'),
  });
}

export function recordLeaderboardViewedWeb(eventId: UUID): void {
  emit('event.leaderboard.viewed_web', {
    eventId,
  });
}

export function emitEventsCreate(payload: { eventId: UUID; code: string; source?: string | null }): void {
  emit('events.create', {
    eventId: payload.eventId,
    code: payload.code,
    source: payload.source ?? 'web',
    ts: Date.now(),
  });
}

export function emitEventsJoin(payload: { eventId: UUID; memberId?: string | null; source?: string | null }): void {
  emit('events.join', {
    eventId: payload.eventId,
    memberId: payload.memberId ?? null,
    source: payload.source ?? 'web',
    ts: Date.now(),
  });
}

export function emitEventsLiveTick(payload: { eventId: UUID; durationMs: number }): void {
  emit('events.live_tick_ms', {
    eventId: payload.eventId,
    durationMs: Math.max(0, Math.round(payload.durationMs)),
    ts: Date.now(),
  });
}

export function emitEventsResync(payload: { eventId: UUID; delayMs: number; attempt: number; reason?: string | null }): void {
  emit('events.resync', {
    eventId: payload.eventId,
    delayMs: Math.max(0, Math.round(payload.delayMs)),
    attempt: Math.max(0, payload.attempt),
    reason: payload.reason ?? null,
    ts: Date.now(),
  });
}

export function emitEventsHostAction(payload: {
  eventId: UUID;
  action: 'start' | 'pause' | 'close' | 'code.regenerate' | string;
  memberId?: string | null;
}): void {
  emit('events.host.action', {
    eventId: payload.eventId,
    action: payload.action,
    memberId: payload.memberId ?? null,
    ts: Date.now(),
  });
}

export function emitEventsTvTick(payload: { eventId: UUID; durationMs: number; source?: string | null }): void {
  emit('events.tv.tick_ms', {
    eventId: payload.eventId,
    durationMs: Math.max(0, Math.round(payload.durationMs)),
    source: payload.source ?? 'web',
    ts: Date.now(),
  });
}

export function emitEventsTvRotate(payload: {
  eventId: UUID;
  intervalMs: number;
  view: 'board' | 'stats' | string;
  source?: string | null;
}): void {
  emit('events.tv.rotate', {
    eventId: payload.eventId,
    intervalMs: Math.max(0, Math.round(payload.intervalMs)),
    view: payload.view,
    source: payload.source ?? 'web',
    ts: Date.now(),
  });
}
