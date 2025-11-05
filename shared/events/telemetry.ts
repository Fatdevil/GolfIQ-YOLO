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
