import type { RealtimeChannel } from '@supabase/supabase-js';

import { scaleHandicapForRound, type EventFormat } from '../../../../shared/event/models';
import type { SharedRoundV1 } from '../../../../shared/event/payload';
import { cloudEnabled, ensureSupabaseSession, supa } from './supabase';
import { CloudSyncError, upsertOrThrow } from './supabaseSafe';
import {
  __resetMockSupabase,
  __setMockUser,
  createEvent as mockCreateEvent,
  ensureUser as mockEnsureUser,
  joinEvent as mockJoinEvent,
  postSharedRound as mockPostSharedRound,
  watchEvent as mockWatchEvent,
} from './mockSupabase';

export type WatchEventCallback = (rounds: SharedRoundV1[]) => void;

export type LiveEventHandle = {
  unsubscribe: () => Promise<void> | void;
};

export type PostSharedRoundResult = {
  ok: boolean;
  reason?: string;
  status?: number;
  code?: string;
};

type EventMetadata = {
  id: string;
  holes?: { start: number; end: number } | null;
  format?: EventFormat;
};

type EventRoundRow = {
  event_id: string;
  participant_id: string;
  participant_name: string | null;
  hcp: number | null;
  round_id: string;
  holes: { start: number; end: number } | null;
  gross: number;
  net: number | null;
  sg: number | null;
  holes_breakdown: SharedRoundV1['holesBreakdown'] | null;
  owner: string;
};

const eventMetaCache = new Map<string, EventMetadata>();

type EventsApi = {
  ensureUser: () => Promise<string | null>;
  createEvent: (
    name: string,
    holes: { start: number; end: number },
    format: EventFormat,
  ) => Promise<{ id: string; joinCode: string }>;
  joinEvent: (
    joinCode: string,
  ) => Promise<{
    id: string;
    joinCode: string;
    name?: string | null;
    holes?: { start: number; end: number } | null;
    format?: EventFormat;
    courseId?: string | null;
  } | null>;
  watchEvent: (eventId: string, onChange: WatchEventCallback) => Promise<() => void>;
  postSharedRound: (eventId: string, payload: SharedRoundV1) => Promise<PostSharedRoundResult>;
};

const realEventsApi: EventsApi | null = (() => {
  if (!cloudEnabled || !supa) {
    return null;
  }

  async function ensureUser(): Promise<string | null> {
    const session = await ensureSupabaseSession();
    return session?.userId ?? null;
  }

  async function loadEventMetadata(eventId: string): Promise<EventMetadata | null> {
    const cached = eventMetaCache.get(eventId);
    if (cached && cached.holes) {
      return cached;
    }
    const userId = await ensureUser();
    if (!userId) {
      return null;
    }
    try {
      const { data, error } = await supa
        .from('events')
        .select('id, holes, format')
        .eq('id', eventId)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      const meta: EventMetadata = {
        id: data.id,
        holes: data.holes as { start: number; end: number } | null,
        format: data.format as EventFormat,
      };
      eventMetaCache.set(eventId, meta);
      return meta;
    } catch {
      return null;
    }
  }

  function mapRowToRound(row: EventRoundRow): SharedRoundV1 {
    const holes = row.holes && typeof row.holes === 'object' ? (row.holes as { start: number; end: number }) : { start: 1, end: 18 };
    const breakdown = Array.isArray(row.holes_breakdown) ? row.holes_breakdown : [];
    return {
      v: 1,
      roundId: row.round_id,
      player: {
        id: row.participant_id,
        name: row.participant_name ?? undefined,
        hcp: Number.isFinite(row.hcp ?? NaN) ? Number(row.hcp) : undefined,
      },
      courseId: undefined,
      holes,
      gross: Number.isFinite(row.gross ?? NaN) ? Number(row.gross) : undefined,
      net: Number.isFinite(row.net ?? NaN) ? Number(row.net) : undefined,
      sg: Number.isFinite(row.sg ?? NaN) ? Number(row.sg) : undefined,
      holesBreakdown: breakdown,
    } satisfies SharedRoundV1;
  }

  function asRoundMap(rows: EventRoundRow[]): Map<string, SharedRoundV1> {
    const map = new Map<string, SharedRoundV1>();
    for (const row of rows) {
      const key = `${row.round_id}:${row.participant_id}`;
      map.set(key, mapRowToRound(row));
    }
    return map;
  }

  async function createEvent(
    name: string,
    holes: { start: number; end: number },
    format: EventFormat,
  ): Promise<{ id: string; joinCode: string }> {
    const userId = await ensureUser();
    if (!userId) {
      throw new Error('Sign in to create a live event');
    }
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `event-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    try {
      const { data, error } = await supa
        .from('events')
        .insert({
          id,
          owner: userId,
          name,
          holes,
          format,
        })
        .select('id, join_code')
        .single();
      if (error || !data) {
        throw new Error(error?.message ?? 'Unable to create live event');
      }
      await upsertOrThrow(
        'event_members',
        { event_id: data.id, member: userId },
        { onConflict: 'event_id,member', returning: 'minimal' },
      );
      eventMetaCache.set(data.id, { id: data.id, holes, format });
      return { id: data.id, joinCode: String(data.join_code) };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unable to create live event');
    }
  }

  async function joinEvent(
    joinCode: string,
  ): Promise<{
    id: string;
    joinCode: string;
    name?: string | null;
    holes?: { start: number; end: number } | null;
    format?: EventFormat;
    courseId?: string | null;
  } | null> {
    const userId = await ensureUser();
    if (!userId) {
      return null;
    }
    try {
      const { data, error } = await supa
        .from('events')
        .select('id, join_code, holes, format, name, course_id')
        .eq('join_code', joinCode)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      await upsertOrThrow(
        'event_members',
        { event_id: data.id, member: userId },
        { onConflict: 'event_id,member', returning: 'minimal' },
      );
      eventMetaCache.set(data.id, {
        id: data.id,
        holes: data.holes as { start: number; end: number } | null,
        format: data.format as EventFormat,
      });
      return {
        id: data.id,
        joinCode: String(data.join_code),
        name: data.name as string | null,
        holes: data.holes as { start: number; end: number } | null,
        format: data.format as EventFormat,
        courseId: data.course_id as string | null,
      };
    } catch {
      return null;
    }
  }

  async function watchEvent(eventId: string, onChange: WatchEventCallback): Promise<() => void> {
    const userId = await ensureUser();
    if (!userId) {
      throw new Error('Sign in to watch live events');
    }
    await loadEventMetadata(eventId);
    const cache = new Map<string, SharedRoundV1>();

    const emit = () => {
      onChange(Array.from(cache.values()));
    };

    try {
      const { data, error } = await supa
        .from('event_rounds')
        .select('event_id, participant_id, participant_name, hcp, round_id, holes, gross, net, sg, holes_breakdown, owner')
        .eq('event_id', eventId);
      if (!error && data) {
        asRoundMap(data as EventRoundRow[]).forEach((value, key) => {
          cache.set(key, value);
        });
        emit();
      }
    } catch {
      // ignore initial load errors and rely on realtime updates
    }

    const channel: RealtimeChannel = supa
      .channel(`ev_${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_rounds',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const newRow = payload.new as EventRoundRow | null;
          const oldRow = payload.old as EventRoundRow | null;
          if (payload.eventType === 'DELETE' && oldRow) {
            cache.delete(`${oldRow.round_id}:${oldRow.participant_id}`);
          } else if (newRow) {
            const mapped = mapRowToRound(newRow);
            cache.set(`${newRow.round_id}:${newRow.participant_id}`, mapped);
          }
          emit();
        },
      );

    channel.subscribe();

    return async () => {
      try {
        await channel.unsubscribe();
      } catch {
        // ignore unsubscribe errors
      }
    };
  }

  async function postSharedRound(
    eventId: string,
    payload: SharedRoundV1,
  ): Promise<PostSharedRoundResult> {
    const userId = await ensureUser();
    if (!userId) {
      return { ok: false, reason: 'Sign in to post rounds' };
    }
    const meta = (await loadEventMetadata(eventId)) ?? { id: eventId };
    const hcp = Number.isFinite(payload.player?.hcp ?? NaN) ? Number(payload.player?.hcp) : undefined;
    const gross = Number.isFinite(payload.gross ?? NaN) ? Number(payload.gross) : undefined;
    const net = Number.isFinite(payload.net ?? NaN)
      ? Number(payload.net)
      : Number.isFinite(gross ?? NaN) && Number.isFinite(hcp ?? NaN)
        ? Math.round(Number(gross) - scaleHandicapForRound(Number(hcp), payload.holes, meta.holes ?? undefined))
        : undefined;

    const breakdown = Array.isArray(payload.holesBreakdown)
      ? payload.holesBreakdown
          .map((hole) => ({
            h: Number.isFinite(hole.h ?? NaN) ? Number(hole.h) : undefined,
            strokes: Number.isFinite(hole.strokes ?? NaN) ? Number(hole.strokes) : undefined,
            net: Number.isFinite(hole.net ?? NaN) ? Number(hole.net) : undefined,
            sg: Number.isFinite(hole.sg ?? NaN) ? Number(hole.sg) : undefined,
          }))
          .filter((hole) => Number.isFinite(hole.h ?? NaN) && Number.isFinite(hole.strokes ?? NaN))
      : [];

    try {
      await upsertOrThrow(
        'event_rounds',
        {
          event_id: eventId,
          participant_id: payload.player.id,
          participant_name: payload.player.name ?? payload.player.id,
          hcp,
          round_id: payload.roundId,
          holes: payload.holes,
          gross: gross ?? 0,
          net: net ?? null,
          sg: Number.isFinite(payload.sg ?? NaN) ? Number(payload.sg) : null,
          holes_breakdown: breakdown,
          owner: userId,
        },
        { onConflict: 'event_id,round_id,participant_id', returning: 'minimal' },
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof CloudSyncError) {
        return { ok: false, reason: error.message, status: error.status, code: error.code };
      }
      if (error instanceof Error) {
        return { ok: false, reason: error.message };
      }
      return { ok: false, reason: 'Unable to share round' };
    }
  }

  const api: EventsApi = {
    ensureUser,
    createEvent,
    joinEvent,
    watchEvent,
    postSharedRound,
  };
  return api;
})();

function useMockEvents(): EventsApi {
  return {
    ensureUser: mockEnsureUser,
    createEvent: mockCreateEvent,
    joinEvent: mockJoinEvent,
    watchEvent: mockWatchEvent,
    postSharedRound: async (eventId, payload) => {
      try {
        await mockPostSharedRound(eventId, payload);
        return { ok: true };
      } catch (error) {
        if (error instanceof Error) {
          return {
            ok: false,
            reason: error.message,
            status: (error as Error & { status?: number }).status,
            code: (error as Error & { code?: string }).code,
          };
        }
        return { ok: false, reason: 'Unable to share round' };
      }
    },
  };
}

const activeEventsApi: EventsApi = realEventsApi ?? useMockEvents();

export const eventsCloudAvailable = Boolean(realEventsApi);

export async function ensureUser(): Promise<string | null> {
  const id = await activeEventsApi.ensureUser();
  return id ?? null;
}

export async function createEvent(
  name: string,
  holes: { start: number; end: number },
  format: EventFormat,
): Promise<{ id: string; joinCode: string }> {
  return activeEventsApi.createEvent(name, holes, format);
}

export async function joinEvent(joinCode: string): Promise<{ id: string; joinCode: string } | null> {
  return activeEventsApi.joinEvent(joinCode);
}

export async function watchEvent(eventId: string, onChange: WatchEventCallback): Promise<() => void> {
  return activeEventsApi.watchEvent(eventId, onChange);
}

export async function postSharedRound(
  eventId: string,
  payload: SharedRoundV1,
): Promise<PostSharedRoundResult> {
  return activeEventsApi.postSharedRound(eventId, payload);
}

export const __mock = {
  reset: __resetMockSupabase,
  setUser: __setMockUser,
};

