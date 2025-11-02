import { EventEmitter } from 'events';

import type { SharedRoundV1 } from '../../../../shared/event/payload';
import { scaleHandicapForRound, type EventFormat } from '../../../../shared/event/models';
import type { RoundSummary } from '../../../../shared/round/summary';
import type { RoundState } from '../../../../shared/round/types';

const randomId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `mock-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

type MockEvent = {
  id: string;
  owner: string;
  name: string;
  courseId?: string;
  holes: { start: number; end: number };
  format: EventFormat;
  joinCode: string;
  members: Set<string>;
};

type MockEventRound = {
  eventId: string;
  roundId: string;
  participantId: string;
  participantName: string;
  hcp?: number | null;
  holes: { start: number; end: number };
  gross: number;
  net?: number | null;
  sg?: number | null;
  holesBreakdown: SharedRoundV1['holesBreakdown'];
  owner: string;
};

type MockRoundBackup = {
  id: string;
  owner: string;
  courseId: string;
  startedAt: number;
  finishedAt?: number;
  holes: { start: number; end: number };
  summary: RoundSummary;
  updatedAt: number;
};

const events = new Map<string, MockEvent>();
const eventRounds = new Map<string, Map<string, MockEventRound>>();
const rounds = new Map<string, MockRoundBackup>();
const watchers = new EventEmitter();

let currentUserId = 'mock-user-host';

const WATCH_EVENT = 'watch-event';

function cloneRound(round: MockEventRound): SharedRoundV1 {
  return {
    v: 1,
    roundId: round.roundId,
    player: {
      id: round.participantId,
      name: round.participantName || undefined,
      hcp: Number.isFinite(round.hcp ?? NaN) ? Number(round.hcp) : undefined,
    },
    courseId: undefined,
    holes: round.holes,
    gross: round.gross,
    net: Number.isFinite(round.net ?? NaN) ? Number(round.net) : undefined,
    sg: Number.isFinite(round.sg ?? NaN) ? Number(round.sg) : undefined,
    holesBreakdown: Array.isArray(round.holesBreakdown) ? [...round.holesBreakdown] : [],
  } satisfies SharedRoundV1;
}

function listEventRoundsInternal(eventId: string): SharedRoundV1[] {
  const map = eventRounds.get(eventId);
  if (!map) {
    return [];
  }
  return Array.from(map.values()).map((entry) => cloneRound(entry));
}

function broadcast(eventId: string): void {
  const roundsForEvent = listEventRoundsInternal(eventId);
  watchers.emit(`${WATCH_EVENT}:${eventId}`, roundsForEvent);
}

export function __setMockUser(id: string): void {
  currentUserId = id;
}

export function __resetMockSupabase(): void {
  events.clear();
  eventRounds.clear();
  rounds.clear();
  watchers.removeAllListeners();
  currentUserId = 'mock-user-host';
}

export async function ensureUser(): Promise<string> {
  return currentUserId;
}

export async function createEvent(
  name: string,
  holes: { start: number; end: number },
  format: EventFormat,
): Promise<{ id: string; joinCode: string }> {
  const id = randomId();
  const joinCode = randomId();
  const event: MockEvent = {
    id,
    owner: currentUserId,
    name,
    holes,
    format,
    courseId: undefined,
    joinCode,
    members: new Set([currentUserId]),
  };
  events.set(id, event);
  return { id, joinCode };
}

export async function joinEvent(
  joinCode: string,
): Promise<{
  id: string;
  joinCode: string;
  name: string;
  holes: { start: number; end: number };
  format: EventFormat;
  courseId?: string;
} | null> {
  for (const event of events.values()) {
    if (event.joinCode === joinCode) {
      event.members.add(currentUserId);
      return {
        id: event.id,
        joinCode: event.joinCode,
        name: event.name,
        holes: event.holes,
        format: event.format,
        courseId: event.courseId,
      };
    }
  }
  return null;
}

export async function postSharedRound(eventId: string, payload: SharedRoundV1): Promise<void> {
  const event = events.get(eventId);
  if (!event || !event.members.has(currentUserId)) {
    throw new Error('Not a member of this event');
  }
  const map = eventRounds.get(eventId) ?? new Map<string, MockEventRound>();
  eventRounds.set(eventId, map);

  const hcp = Number.isFinite(payload.player?.hcp ?? NaN) ? Number(payload.player?.hcp) : undefined;
  const gross = Number.isFinite(payload.gross ?? NaN) ? Number(payload.gross) : 0;
  const computedNet =
    Number.isFinite(payload.net ?? NaN)
      ? Number(payload.net)
      : Number.isFinite(gross) && Number.isFinite(hcp ?? NaN)
        ? gross - Math.round(scaleHandicapForRound(Number(hcp), payload.holes, event.holes))
        : undefined;

  const entry: MockEventRound = {
    eventId,
    roundId: payload.roundId,
    participantId: payload.player.id,
    participantName: payload.player.name ?? payload.player.id,
    hcp,
    holes: payload.holes,
    gross,
    net: computedNet ?? null,
    sg: Number.isFinite(payload.sg ?? NaN) ? Number(payload.sg) : null,
    holesBreakdown: Array.isArray(payload.holesBreakdown) ? [...payload.holesBreakdown] : [],
    owner: currentUserId,
  };

  map.set(`${payload.roundId}:${payload.player.id}`, entry);
  broadcast(eventId);
}

export async function watchEvent(
  eventId: string,
  onChange: (rounds: SharedRoundV1[]) => void,
): Promise<() => void> {
  const handler = (roundsList: SharedRoundV1[]) => {
    onChange(roundsList);
  };
  watchers.addListener(`${WATCH_EVENT}:${eventId}`, handler);
  onChange(listEventRoundsInternal(eventId));
  return () => {
    watchers.removeListener(`${WATCH_EVENT}:${eventId}`, handler);
  };
}

export async function pushRound(round: RoundState, summary: RoundSummary): Promise<void> {
  const holeNumbers = summary.holes.map((hole) => hole.hole);
  const start = holeNumbers.length ? Math.min(...holeNumbers) : 1;
  const end = holeNumbers.length ? Math.max(...holeNumbers) : start;
  rounds.set(round.id, {
    id: round.id,
    owner: currentUserId,
    courseId: round.courseId,
    startedAt: round.startedAt,
    finishedAt: round.finishedAt,
    holes: { start, end },
    summary,
    updatedAt: Date.now(),
  });
}

export async function listRounds(): Promise<MockRoundBackup[]> {
  return Array.from(rounds.values()).filter((entry) => entry.owner === currentUserId);
}

