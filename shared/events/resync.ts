import type { UUID } from './types';

export type SyncHealthStatus = 'ok' | 'behind' | 'error';

export type SyncHealthSnapshot = {
  status: SyncHealthStatus;
  lastSyncTs: number | null;
  lastDriftTs: number | null;
  lastError: string | null;
  pending: boolean;
  attempts: number;
  scheduledEventId: UUID | null;
};

type ResyncHandler = (eventId: UUID) => void;

type DriftContext = {
  localRevision?: number;
  remoteRevision?: number;
  localHash?: string | null;
  remoteHash?: string | null;
};

type State = {
  status: SyncHealthStatus;
  lastSyncTs: number | null;
  lastDriftTs: number | null;
  lastError: string | null;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
  scheduledEventId: UUID | null;
};

const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_JITTER_MS = 1_000;

let state: State = {
  status: 'ok',
  lastSyncTs: null,
  lastDriftTs: null,
  lastError: null,
  attempts: 0,
  timer: null,
  scheduledEventId: null,
};

let handler: ResyncHandler | null = null;
let nowProvider: () => number = () => Date.now();
let randomProvider: () => number = () => Math.random();

const listeners = new Set<(snapshot: SyncHealthSnapshot) => void>();

function cloneState(): SyncHealthSnapshot {
  return {
    status: state.status,
    lastSyncTs: state.lastSyncTs,
    lastDriftTs: state.lastDriftTs,
    lastError: state.lastError,
    pending: state.timer !== null,
    attempts: state.attempts,
    scheduledEventId: state.scheduledEventId,
  };
}

function notify(): void {
  const snapshot = cloneState();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('[events/resync] listener failed', error);
    }
  }
}

function buildDriftMessage(eventId: UUID, ctx?: DriftContext): string {
  const revisionPart = ctx?.localRevision != null
    ? `local=${ctx.localRevision} remote=${ctx?.remoteRevision ?? 'n/a'}`
    : 'revision=n/a';
  const hashPart = ctx?.localHash
    ? `hash=${ctx.localHash}${ctx.remoteHash ? `/${ctx.remoteHash}` : ''}`
    : ctx?.remoteHash
      ? `hash=remote:${ctx.remoteHash}`
      : 'hash=n/a';
  return `event ${eventId} drift (${revisionPart}; ${hashPart})`;
}

function scheduleResync(eventId: UUID): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.attempts = Math.max(0, state.attempts);
  state.attempts += 1;
  state.scheduledEventId = eventId;
  const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (state.attempts - 1));
  const jitter = Math.floor(randomProvider() * MAX_JITTER_MS);
  const delay = backoff + jitter;
  state.timer = setTimeout(() => {
    state.timer = null;
    const scheduledFor = state.scheduledEventId ?? eventId;
    if (handler) {
      try {
        handler(scheduledFor);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? 'resync failed');
        state.status = 'error';
        state.lastError = message;
        state.lastDriftTs = nowProvider();
      }
    }
    notify();
  }, delay);
  notify();
}

export function observeSyncSuccess(): void {
  state.status = 'ok';
  state.lastSyncTs = nowProvider();
  state.lastError = null;
  state.lastDriftTs = null;
  state.attempts = 0;
  state.scheduledEventId = null;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  notify();
}

export function observeSyncDrift(eventId: UUID, context?: DriftContext): void {
  state.status = 'behind';
  state.lastDriftTs = nowProvider();
  state.lastError = buildDriftMessage(eventId, context);
  scheduleResync(eventId);
}

export function observeSyncError(eventId: UUID, error: unknown): void {
  state.status = 'error';
  state.lastDriftTs = nowProvider();
  state.lastError = error instanceof Error ? error.message : String(error ?? 'sync error');
  scheduleResync(eventId);
}

export function enqueueEventResync(eventId: UUID, reason?: string): void {
  state.status = 'behind';
  state.lastDriftTs = nowProvider();
  state.lastError = reason ?? `resync requested for event ${eventId}`;
  scheduleResync(eventId);
}

export function forceResync(eventId: UUID): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.status = 'behind';
  state.lastDriftTs = nowProvider();
  state.lastError = `manual resync for event ${eventId}`;
  state.attempts += 1;
  state.scheduledEventId = eventId;
  notify();
  if (handler) {
    try {
      handler(eventId);
    } catch (error) {
      state.status = 'error';
      state.lastError = error instanceof Error ? error.message : String(error ?? 'resync failed');
      state.lastDriftTs = nowProvider();
    }
  }
  notify();
}

export function getSyncHealth(): SyncHealthSnapshot {
  return cloneState();
}

export function subscribeSyncHealth(listener: (snapshot: SyncHealthSnapshot) => void): () => void {
  listeners.add(listener);
  try {
    listener(cloneState());
  } catch (error) {
    console.warn('[events/resync] listener failed on subscribe', error);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function setResyncHandler(next: ResyncHandler | null | undefined): void {
  handler = typeof next === 'function' ? next : null;
}

export function resetSyncHealthForTests(): void {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state = {
    status: 'ok',
    lastSyncTs: null,
    lastDriftTs: null,
    lastError: null,
    attempts: 0,
    timer: null,
    scheduledEventId: null,
  };
  handler = null;
  listeners.clear();
}

export function __setNowProviderForTests(fn: (() => number) | null): void {
  nowProvider = fn ?? (() => Date.now());
}

export function __setRandomProviderForTests(fn: (() => number) | null): void {
  randomProvider = fn ?? (() => Math.random());
}
