import { ensureClient } from '../supabase/client';
import { pickTopShots } from '../reels/select';
import type { ReelShotRef } from '../reels/types';
import { aggregateLeaderboard } from './scoring';
import {
  enqueueEventResync,
  observeSyncDrift as observeSyncDriftMetric,
  observeSyncError,
  observeSyncSuccess,
} from './resync';
import type {
  Event,
  EventSettings,
  LiveSpectatorEvent,
  LiveSpectatorPlayer,
  LiveSpectatorShot,
  LiveSpectatorSnapshot,
  Participant,
  ScoreRow,
  ScoringFormat,
  TvFlags,
  UUID,
} from './types';

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

const DEFAULT_TV_FLAGS: Required<Pick<TvFlags, 'showQrOverlay' | 'autoRotateTop'>> &
  Partial<TvFlags> = {
    showQrOverlay: false,
    autoRotateTop: true,
    rotateIntervalMs: undefined,
  };

const DEFAULT_EVENT_SETTINGS: EventSettings = {
  scoringFormat: 'stroke',
  allowancePct: DEFAULT_ALLOWANCE.stroke,
  grossNet: 'net',
  tvFlags: { ...DEFAULT_TV_FLAGS },
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
  const grossNet = settings.grossNet === 'gross' ? 'gross' : 'net';
  const tvFlags: TvFlags = {
    ...DEFAULT_TV_FLAGS,
    ...(settings.tvFlags ?? {}),
  };
  return {
    scoringFormat,
    allowancePct: allowance,
    grossNet,
    tvFlags,
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

type LiveScoreViewRow = {
  event_id: UUID;
  round_id: UUID | null;
  spectator_id?: string | null;
  user_id?: UUID | null;
  display_name?: string | null;
  hcp_index?: number | null;
  hole_no: number;
  gross: number;
  net?: number | null;
  stableford?: number | null;
  to_par: number;
  par?: number | null;
  strokes_received?: number | null;
  playing_handicap?: number | null;
  course_handicap?: number | null;
  ts: string;
  format?: string | null;
};

type LiveEventViewRow = {
  event_id: UUID;
  name?: string | null;
  status?: string | null;
  scoring_format?: string | null;
  allowance_pct?: number | null;
};

type LiveShotViewRow = {
  event_id: UUID;
  round_id: UUID;
  shot_public_id: string;
  hole: number;
  seq: number;
  club?: string | null;
  carry_m?: number | null;
  plays_like_pct?: number | null;
  strokes_gained?: number | null;
  start_ts_ms?: number | null;
  updated_at?: string | null;
};

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toScoringFormat(raw: unknown, fallback: ScoringFormat = 'stroke'): ScoringFormat {
  if (raw === 'stableford' || raw === 'stroke') {
    return raw;
  }
  return fallback;
}

function toScoreRow(row: LiveScoreViewRow, spectatorId: string): ScoreRow {
  const gross = Number.isFinite(row.gross) ? Number(row.gross) : 0;
  const parValue = Number.isFinite(row.par ?? NaN) ? Number(row.par) : null;
  const netValue = Number.isFinite(row.net ?? NaN) ? Number(row.net) : gross;
  const toParValue = Number.isFinite(row.to_par ?? NaN)
    ? Number(row.to_par)
    : parValue != null
      ? gross - parValue
      : 0;
  return {
    event_id: row.event_id,
    user_id: spectatorId,
    hole_no: row.hole_no,
    gross,
    net: netValue,
    to_par: toParValue,
    par: parValue,
    strokes_received: Number.isFinite(row.strokes_received ?? NaN) ? Number(row.strokes_received) : null,
    stableford: Number.isFinite(row.stableford ?? NaN) ? Number(row.stableford) : null,
    playing_handicap: Number.isFinite(row.playing_handicap ?? NaN) ? Number(row.playing_handicap) : null,
    course_handicap: Number.isFinite(row.course_handicap ?? NaN) ? Number(row.course_handicap) : null,
    format: toScoringFormat(row.format),
    ts: typeof row.ts === 'string' ? row.ts : new Date().toISOString(),
  };
}

function toSpectatorPlayer(
  spectatorId: string,
  displayName: string,
  source: ReturnType<typeof aggregateLeaderboard>[number],
  whsIndex: number | null,
): LiveSpectatorPlayer {
  return {
    id: spectatorId,
    name: displayName,
    gross: source.gross,
    net: source.net,
    stableford: source.stableford,
    toPar: source.to_par ?? source.toPar ?? null,
    thru: source.holes,
    lastUpdated: source.last_ts ?? null,
    playingHandicap: source.playing_handicap ?? null,
    whsIndex,
  };
}

function toShotRef(row: LiveShotViewRow): ReelShotRef {
  const ts = toNumber(row.start_ts_ms) ?? (typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : Date.now());
  return {
    id: row.shot_public_id,
    ts: Number.isFinite(ts) ? Number(ts) : Date.now(),
    club: row.club ?? undefined,
    carry_m: toNumber(row.carry_m) ?? undefined,
    playsLikePct: toNumber(row.plays_like_pct) ?? undefined,
  };
}

function toSpectatorShot(row: LiveShotViewRow): LiveSpectatorShot {
  return {
    id: row.shot_public_id,
    hole: Number.isFinite(row.hole) ? Number(row.hole) : 0,
    seq: Number.isFinite(row.seq) ? Number(row.seq) : 0,
    club: row.club ?? null,
    carry: toNumber(row.carry_m),
    playsLikePct: toNumber(row.plays_like_pct),
    strokesGained: toNumber(row.strokes_gained),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function fetchLiveRoundSnapshot(eventId: UUID, roundId: UUID): Promise<LiveSpectatorSnapshot | null> {
  const c = await requireClient();
  const [eventResp, scoreResp, shotsResp] = await Promise.all([
    c
      .from('event_live_public_events')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle(),
    c
      .from('event_live_round_scores')
      .select('*')
      .eq('event_id', eventId)
      .eq('round_id', roundId),
    c
      .from('event_live_round_shots')
      .select('*')
      .eq('event_id', eventId)
      .eq('round_id', roundId),
  ]);

  if (eventResp.error) {
    throw new Error('fetchLiveRoundSnapshot failed to load event');
  }
  if (scoreResp.error) {
    throw new Error('fetchLiveRoundSnapshot failed to load scores');
  }
  if (shotsResp.error) {
    throw new Error('fetchLiveRoundSnapshot failed to load shots');
  }

  const eventRow = (eventResp.data ?? null) as LiveEventViewRow | null;
  if (!eventRow) {
    return null;
  }

  const format = toScoringFormat(eventRow.scoring_format);
  const allowance = Number.isFinite(eventRow.allowance_pct ?? NaN) ? Number(eventRow.allowance_pct) : null;
  const event: LiveSpectatorEvent = {
    id: eventId,
    name: eventRow.name ?? 'Event',
    status: eventRow.status ?? null,
    format,
    allowancePct: allowance,
  };

  const scoreRows = Array.isArray(scoreResp.data) ? (scoreResp.data as LiveScoreViewRow[]) : [];
  const nameMap: Record<string, string> = {};
  const hcpMap: Record<string, number | null | undefined> = {};
  const holesPlayed: Record<string, number> = {};
  const viewWhsIndex: Record<string, number | null> = {};
  const mappedRows: ScoreRow[] = [];

  for (const row of scoreRows) {
    const spectatorId = row.spectator_id ?? row.user_id ?? `${row.display_name ?? 'player'}:${row.hole_no}`;
    const displayName = row.display_name ?? 'Player';
    mappedRows.push(toScoreRow(row, spectatorId));
    nameMap[spectatorId] = displayName;
    const hcpValue = toNumber(row.hcp_index);
    if (hcpValue !== null) {
      hcpMap[spectatorId] = hcpValue;
      viewWhsIndex[spectatorId] = hcpValue;
    } else {
      viewWhsIndex[spectatorId] = null;
    }
    holesPlayed[spectatorId] = (holesPlayed[spectatorId] ?? 0) + 1;
  }

  const leaderboard = aggregateLeaderboard(mappedRows, nameMap, {
    hcpIndexByUser: hcpMap,
    holesPlayedByUser: holesPlayed,
    format,
  });

  const players: LiveSpectatorPlayer[] = leaderboard.map((row) =>
    toSpectatorPlayer(row.user_id, row.display_name, row, viewWhsIndex[row.user_id] ?? null),
  );

  const scoreUpdated = mappedRows
    .map((row) => {
      const ts = typeof row.ts === 'string' ? Date.parse(row.ts) : Number(row.ts);
      return Number.isFinite(ts) ? Number(ts) : null;
    })
    .filter((ts): ts is number => Number.isFinite(ts ?? NaN));

  const shotsRaw = Array.isArray(shotsResp.data) ? (shotsResp.data as LiveShotViewRow[]) : [];
  const shotRefs: ReelShotRef[] = shotsRaw.map(toShotRef);
  const shotsById = new Map<string, LiveShotViewRow>();
  for (const row of shotsRaw) {
    shotsById.set(row.shot_public_id, row);
  }
  const picked = pickTopShots(shotRefs, 3);
  const topShots: LiveSpectatorShot[] = picked
    .map((ref) => {
      const source = shotsById.get(ref.id);
      if (!source) {
        return null;
      }
      const base = toSpectatorShot(source);
      if (!base.updatedAt && Number.isFinite(ref.ts)) {
        base.updatedAt = new Date(ref.ts).toISOString();
      }
      return base;
    })
    .filter((shot): shot is LiveSpectatorShot => Boolean(shot));

  const updatedAt = scoreUpdated.length
    ? new Date(Math.max(...scoreUpdated)).toISOString()
    : topShots.length
      ? topShots.reduce<string | null>((acc, shot) => {
          if (!shot.updatedAt) {
            return acc;
          }
          if (!acc) {
            return shot.updatedAt;
          }
          return acc > shot.updatedAt ? acc : shot.updatedAt;
        }, null)
      : null;

  return {
    event,
    players,
    topShots,
    updatedAt,
    format,
  };
}

export async function pollLiveRoundSnapshot(
  eventId: UUID,
  roundId: UUID,
  onSnapshot: (snapshot: LiveSpectatorSnapshot) => void,
  intervalMs = 5000,
): Promise<() => void> {
  const delay = Math.max(1000, Number(intervalMs) || 0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const schedule = () => {
    if (cancelled) {
      return;
    }
    timer = setTimeout(async () => {
      try {
        const snapshot = await fetchLiveRoundSnapshot(eventId, roundId);
        if (snapshot && !cancelled) {
          onSnapshot(snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[events] live poll failed', error);
        }
      } finally {
        schedule();
      }
    }, delay);
  };

  const initial = await fetchLiveRoundSnapshot(eventId, roundId);
  if (initial) {
    onSnapshot(initial);
  }
  schedule();

  return () => {
    cancelled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
