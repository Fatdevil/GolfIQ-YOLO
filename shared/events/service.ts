import { ensureClient } from '../supabase/client';
import {
  enqueueEventResync,
  observeSyncDrift as observeSyncDriftMetric,
  observeSyncError,
  observeSyncSuccess,
} from './resync';
import type { Event, EventSettings, Participant, ScoreRow, ScoringFormat, UUID } from './types';

// --- helpers ---
async function requireClient() {
  const c = await ensureClient();
  if (!c) throw new Error('Supabase not configured');
  return c;
}

function nowIso() {
  return new Date().toISOString();
}

type RoundResyncJob = {
  type: 'round_resync';
  eventId: UUID;
  userId: UUID | string;
  reason?: string;
};

type SyncDriftObservation = {
  eventId: UUID;
  userId: UUID | string | null;
  hole: number;
  prevRevision: number | null;
  localRevision: number | null;
  prevHash: string | null;
  localHash: string | null;
};

type SyncHealthObservation = SyncDriftObservation & {
  status: 'ok' | 'behind' | 'error';
  error?: unknown;
};

type SyncIntegrations = {
  enqueueSync?: (job: RoundResyncJob) => void;
  observeSyncHealth?: (payload: SyncHealthObservation) => void;
  observeSyncDrift?: (payload: SyncDriftObservation) => void;
};

const defaultIntegrations: Required<SyncIntegrations> = {
  enqueueSync: (job) => {
    if (job.type === 'round_resync') {
      enqueueEventResync(job.eventId, job.reason ?? `round resync for ${job.userId}`);
    }
  },
  observeSyncHealth: (payload) => {
    if (payload.status === 'ok') {
      observeSyncSuccess();
      return;
    }
    if (payload.status === 'behind') {
      observeSyncDriftMetric(payload.eventId, {
        localRevision: payload.localRevision ?? undefined,
        remoteRevision: payload.prevRevision ?? undefined,
        localHash: payload.localHash,
        remoteHash: payload.prevHash,
      });
      return;
    }
    observeSyncError(payload.eventId, payload.error);
  },
  observeSyncDrift: (payload) => {
    observeSyncDriftMetric(payload.eventId, {
      localRevision: payload.localRevision ?? undefined,
      remoteRevision: payload.prevRevision ?? undefined,
      localHash: payload.localHash,
      remoteHash: payload.prevHash,
    });
  },
};

let activeIntegrations: Required<SyncIntegrations> = { ...defaultIntegrations };

export function __setEventSyncIntegrationsForTests(overrides: Partial<SyncIntegrations> | null): void {
  activeIntegrations = { ...defaultIntegrations, ...(overrides ?? {}) };
}

const DEFAULT_ALLOWANCE: Record<ScoringFormat, number> = {
  stroke: 95,
  stableford: 95,
};

const DEFAULT_EVENT_SETTINGS: EventSettings = {
  scoringFormat: 'stroke',
  allowancePct: DEFAULT_ALLOWANCE.stroke,
};

function normalizeSettings(settings: EventSettings | null | undefined): EventSettings {
  if (!settings) {
    return { ...DEFAULT_EVENT_SETTINGS };
  }
  const scoringFormat: ScoringFormat = settings.scoringFormat ?? 'stroke';
  const allowanceRaw = settings.allowancePct;
  const allowance = Number.isFinite(allowanceRaw ?? NaN)
    ? Math.max(0, Number(allowanceRaw))
    : DEFAULT_ALLOWANCE[scoringFormat];
  return {
    scoringFormat,
    allowancePct: allowance,
  };
}

// Map round -> participant.user_id for this event (never confuse round_id with user_id)
async function resolveUserIdForRound(eventId: UUID, roundId: UUID): Promise<string | null> {
  const c = await requireClient();
  const { data, error } = await c
    .from('event_participants')
    .select('user_id, round_id')
    .eq('event_id', eventId)
    .eq('round_id', roundId)
    .limit(1);
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : undefined;
  return row?.user_id ?? null;
}

// --- API ---
export async function createEvent(name: string): Promise<Event> {
  const c = await requireClient();
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const payload = {
    name,
    code,
    start_at: nowIso(),
    status: 'open',
    settings: normalizeSettings(null),
  };
  const { data, error } = await c.from('events').insert(payload).select().single();
  if (error || !data) throw new Error('createEvent failed');
  const row = data as Event;
  return { ...row, settings: normalizeSettings(row.settings) };
}

export async function joinEventByCode(
  code: string,
  p: Omit<Participant, 'event_id'> & { event_id?: UUID },
): Promise<Participant> {
  const c = await requireClient();
  const { data: ev, error: e1 } =
    (await c
      .from('events')
      .select('id,code,status,name,start_at')
      .eq('code', code)
      .eq('status', 'open')
      .limit(1)) ?? {};
  if (e1 || !ev || (Array.isArray(ev) && !ev.length)) throw new Error('event not found');
  const eventRow = Array.isArray(ev) ? ev[0] : ev;
  if (!eventRow?.id) throw new Error('event not found');
  const row: Participant = {
    event_id: eventRow.id,
    user_id: p.user_id,
    display_name: p.display_name,
    hcp_index: p.hcp_index ?? null,
    round_id: p.round_id ?? null,
  };
  const { data, error } = await c
    .from('event_participants')
    .upsert(row, { onConflict: 'event_id,user_id' })
    .select()
    .single();
  if (error || !data) throw new Error('joinEvent failed');
  return data as Participant;
}

export async function attachRound(eventId: UUID, userId: UUID, roundId: UUID) {
  const c = await requireClient();
  const { error } = await c
    .from('event_participants')
    .update({ round_id: roundId })
    .eq('event_id', eventId)
    .eq('user_id', userId);
  if (error) throw new Error('attachRound failed');
}

export async function pushHoleScore(args: {
  eventId: UUID;
  roundId: UUID;
  hole: number;
  gross: number;
  par: number;
  net?: number | null;
  stableford?: number | null;
  strokesReceived?: number | null;
  courseHandicap?: number | null;
  playingHandicap?: number | null;
  hcpIndex?: number | null;
  roundRevision?: number | null;
  scoresHash?: string | null;
  format?: ScoringFormat;
}): Promise<void> {
  let userId: string | null = null;
  let localRevision: number | null = null;
  let localHash: string | null = null;
  let prevRevision: number | null = null;
  let prevHash: string | null = null;
  try {
    const c = await requireClient();
    userId = await resolveUserIdForRound(args.eventId, args.roundId);
    if (!userId) {
      throw new Error('no participant mapping for round');
    }

    localRevision = Number.isFinite(args.roundRevision as number)
      ? Math.max(0, Math.floor(Number(args.roundRevision)))
      : null;
    localHash =
      typeof args.scoresHash === 'string' && args.scoresHash.trim()
        ? args.scoresHash.trim()
        : null;

    const baseTable = c.from('event_scores');
    const selectable =
      typeof (baseTable as { select?: (cols: string) => any }).select === 'function'
        ? (baseTable as { select: (cols: string) => any }).select.call(baseTable, 'round_revision, scores_hash')
        : baseTable;

    const filters = { event_id: args.eventId, user_id: userId, hole_no: args.hole };
    let filtered: any = selectable;
    if (typeof filtered?.match === 'function') {
      filtered = filtered.match(filters);
    } else if (typeof filtered?.eq === 'function') {
      filtered = filtered.eq('event_id', args.eventId);
      if (typeof filtered?.eq === 'function') {
        filtered = filtered.eq('user_id', userId);
      }
      if (typeof filtered?.eq === 'function') {
        filtered = filtered.eq('hole_no', args.hole);
      }
    }

    let selectData: unknown = null;
    let selectError: unknown = null;

    if (typeof filtered?.maybeSingle === 'function') {
      const { data, error } = await filtered.maybeSingle();
      selectData = data ?? null;
      selectError = error ?? null;
    } else if (typeof filtered?.single === 'function') {
      const { data, error } = await filtered.single();
      selectData = data ?? null;
      selectError = error ?? null;
    } else if (typeof filtered?.limit === 'function') {
      const { data, error } = await filtered.limit(1);
      selectData = Array.isArray(data) ? data[0] ?? null : data ?? null;
      selectError = error ?? null;
    }

    if (selectError) {
      throw selectError instanceof Error ? selectError : new Error('pushHoleScore select failed');
    }

    const prevRow = selectData && typeof selectData === 'object' ? (selectData as Partial<ScoreRow>) : null;

    const rawPrevRevision = prevRow ? (prevRow as Record<string, unknown>).round_revision : null;
    if (typeof rawPrevRevision === 'number') {
      prevRevision = rawPrevRevision;
    } else if (typeof rawPrevRevision === 'string' && rawPrevRevision.trim()) {
      const parsed = Number(rawPrevRevision);
      prevRevision = Number.isFinite(parsed) ? Math.floor(parsed) : null;
    } else {
      prevRevision = null;
    }

    const rawPrevHash = prevRow ? (prevRow as Record<string, unknown>).scores_hash : null;
    prevHash = typeof rawPrevHash === 'string' && rawPrevHash.trim() ? rawPrevHash.trim() : null;

    const revisionDrift =
      prevRevision !== null && localRevision !== null && prevRevision !== localRevision;
    const hashDrift = Boolean(prevHash && localHash && prevHash !== localHash);
    const remoteAhead =
      prevRevision !== null && localRevision !== null && prevRevision > localRevision;

    if (remoteAhead) {
      activeIntegrations.enqueueSync?.({
        type: 'round_resync',
        eventId: args.eventId,
        userId,
        reason: 'remote_ahead',
      });
      activeIntegrations.observeSyncHealth?.({
        status: 'behind',
        eventId: args.eventId,
        userId,
        hole: args.hole,
        prevRevision,
        localRevision,
        prevHash,
        localHash,
      });
      return;
    }

    const par = Number.isFinite(args.par)
      ? Math.max(3, Math.min(6, Math.round(Number(args.par))))
      : 4;
    const hasExplicitNet = Number.isFinite(args.net as number);
    let netValue: number | undefined;
    if (hasExplicitNet) {
      netValue = Math.max(1, Math.round(Number(args.net)));
    }
    const format: ScoringFormat = args.format ?? 'stroke';
    const hasStablefordInput = Number.isFinite(args.stableford ?? NaN);
    const stablefordValue = hasStablefordInput
      ? Math.max(0, Math.round(Number(args.stableford)))
      : null;
    const includeStableford = format === 'stableford' && stablefordValue !== null;
    const strokesReceived = Number.isFinite(args.strokesReceived ?? NaN)
      ? Math.trunc(Number(args.strokesReceived))
      : null;
    const courseHandicap = Number.isFinite(args.courseHandicap ?? NaN)
      ? Math.round(Number(args.courseHandicap))
      : null;
    const playingHandicap = Number.isFinite(args.playingHandicap ?? NaN)
      ? Math.round(Number(args.playingHandicap))
      : null;

    const row: Partial<ScoreRow> & { ts: string } = {
      event_id: args.eventId,
      user_id: userId,
      hole_no: args.hole,
      gross: args.gross ?? 0,
      ...(hasExplicitNet && netValue !== undefined ? { net: netValue } : {}),
      to_par: (args.gross ?? 0) - par,
      par,
      strokes_received: strokesReceived,
      ...(includeStableford ? { stableford: stablefordValue } : {}),
      course_handicap: courseHandicap,
      playing_handicap: playingHandicap,
      ts: nowIso(),
      round_revision: localRevision,
      scores_hash: localHash,
    };

    const { error: upsertError } = await c
      .from('event_scores')
      .upsert(row, { onConflict: 'event_id,user_id,hole_no', returning: 'minimal' });

    if (upsertError) {
      throw upsertError instanceof Error ? upsertError : new Error('pushHoleScore upsert failed');
    }

    if (revisionDrift || hashDrift) {
      activeIntegrations.observeSyncDrift?.({
        eventId: args.eventId,
        userId,
        hole: args.hole,
        prevRevision,
        localRevision,
        prevHash,
        localHash,
      });
    }

    activeIntegrations.observeSyncHealth?.({
      status: 'ok',
      eventId: args.eventId,
      userId,
      hole: args.hole,
      prevRevision,
      localRevision,
      prevHash,
      localHash,
    });
  } catch (error) {
    activeIntegrations.observeSyncHealth?.({
      status: 'error',
      eventId: args.eventId,
      userId,
      hole: args.hole,
      prevRevision,
      localRevision,
      prevHash,
      localHash,
      error,
    });
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('pushHoleScore failed');
  }
}

// Optional: simple polling subscribe (avoid realtime complexity in v1)
export async function pollScores(
  eventId: UUID,
  onRows: (rows: ScoreRow[]) => void,
  intervalMs = 10000,
) {
  const c = await requireClient();
  let timer: any;
  const tick = async () => {
    const { data, error } = await c
      .from('event_scores')
      .select('*')
      .eq('event_id', eventId);
    if (!error && Array.isArray(data)) onRows(data as ScoreRow[]);
    timer = setTimeout(tick, intervalMs);
  };
  await tick();
  return () => {
    if (timer) clearTimeout(timer);
  };
}

export async function fetchEvent(eventId: UUID): Promise<Event | null> {
  const c = await requireClient();
  const { data, error } = await c
    .from('events')
    .select('id,name,code,status,start_at,settings')
    .eq('id', eventId)
    .limit(1);
  if (error || !data) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }
  const event = row as Event;
  return { ...event, settings: normalizeSettings(event.settings) };
}

export async function updateEventSettings(eventId: UUID, settings: EventSettings): Promise<Event> {
  const c = await requireClient();
  const normalized = normalizeSettings(settings);
  const { data, error } = await c
    .from('events')
    .update({ settings: normalized })
    .eq('id', eventId)
    .select('id,name,code,status,start_at,settings')
    .single();
  if (error || !data) {
    throw new Error('updateEventSettings failed');
  }
  const row = data as Event;
  return { ...row, settings: normalizeSettings(row.settings) };
}

export async function listParticipants(eventId: UUID): Promise<Participant[]> {
  const c = await requireClient();
  const { data, error } = await c
    .from('event_participants')
    .select('*')
    .eq('event_id', eventId);
  if (error) throw new Error('listParticipants failed');
  return (data ?? []) as Participant[];
}
