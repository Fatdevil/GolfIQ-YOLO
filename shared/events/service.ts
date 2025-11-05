import { getSupabase } from '../supabase/client';
import type { Event, Participant, ScoreRow, UUID } from './types';

// --- helpers ---
async function requireClient() {
  const c = await getSupabase();
  if (!c) throw new Error('Supabase not configured');
  return c;
}

function nowIso() {
  return new Date().toISOString();
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
  const payload = { name, code, start_at: nowIso(), status: 'open' };
  const { data, error } = await c.from('events').insert(payload).select().single();
  if (error || !data) throw new Error('createEvent failed');
  return data as Event;
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
  hcpIndex?: number | null;
}) {
  const c = await requireClient();
  const userId = await resolveUserIdForRound(args.eventId, args.roundId);
  if (!userId) throw new Error('no participant mapping for round');

  const net = Math.max(
    0,
    (args.gross ?? 0) - Math.round((args.hcpIndex ?? 0) * (1 / 18)),
  );
  const to_par = (args.gross ?? 0) - 4;

  const row: Omit<ScoreRow, 'ts'> & { ts: string } = {
    event_id: args.eventId,
    user_id: userId,
    hole_no: args.hole,
    gross: args.gross,
    net,
    to_par,
    ts: nowIso(),
  } as any;

  const { error } = await c
    .from('event_scores')
    .upsert(row, { onConflict: 'event_id,user_id,hole_no' });
  if (error) throw new Error('pushHoleScore failed');
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
    .select('id,name,code,status,start_at')
    .eq('id', eventId)
    .limit(1);
  if (error || !data) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }
  return row as Event;
}
