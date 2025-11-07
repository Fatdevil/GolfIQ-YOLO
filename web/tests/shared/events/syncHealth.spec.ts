import { afterEach, describe, expect, it, vi } from 'vitest';

import { __setEventSyncIntegrationsForTests, pushHoleScore } from '@shared/events/service';
import { setSupabaseClientOverride } from '@shared/supabase/client';

type QueryResult = Promise<{ data: unknown; error: unknown } | { data?: unknown; error?: unknown }>;

function createParticipantsQuery(userId = 'user-1', roundId = 'round-1') {
  const query: any = {};
  query.eq = vi.fn(() => query);
  query.limit = vi.fn(async () => ({
    data: [
      {
        user_id: userId,
        round_id: roundId,
      },
    ],
    error: null,
  }));
  return query;
}

function createEventScoresQuery(selectImpl: () => QueryResult, upsertImpl: () => Promise<{ error: unknown } | { error?: unknown }>) {
  const baseQuery: any = {
    maybeSingle: vi.fn(selectImpl),
    limit: vi.fn(async (count: number) => {
      if (count !== 1) {
        throw new Error('unexpected limit count');
      }
      return selectImpl();
    }),
  };
  const query = {
    match: vi.fn(() => baseQuery),
  };
  const select = vi.fn(() => query);
  const upsert = vi.fn(upsertImpl);
  return { select, upsert, baseQuery };
}

describe('pushHoleScore sync health decisions', () => {
  afterEach(() => {
    __setEventSyncIntegrationsForTests(null);
    setSupabaseClientOverride(null);
    vi.restoreAllMocks();
  });

  it('does not overwrite when remote revision is ahead; queues resync', async () => {
    const participantsQuery = createParticipantsQuery();
    const selectResult = async () => ({
      data: { round_revision: 12, scores_hash: 'remote-hash' },
      error: null,
    });
    const { select, upsert } = createEventScoresQuery(selectResult, async () => ({ error: null }));

    const supabase = {
      from(table: string) {
        if (table === 'event_participants') {
          return {
            select: vi.fn(() => participantsQuery),
          };
        }
        if (table === 'event_scores') {
          return {
            select,
            upsert,
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as Record<string, unknown>;

    setSupabaseClientOverride(supabase as any);

    const enqueueSync = vi.fn();
    const observeSyncHealth = vi.fn();
    const observeSyncDrift = vi.fn();

    __setEventSyncIntegrationsForTests({ enqueueSync, observeSyncHealth, observeSyncDrift });

    await pushHoleScore({
      eventId: 'event-1',
      roundId: 'round-1',
      hole: 3,
      gross: 4,
      par: 4,
      roundRevision: 10,
      scoresHash: 'local-hash',
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(enqueueSync).toHaveBeenCalledTimes(1);
    expect(enqueueSync).toHaveBeenCalledWith({
      type: 'round_resync',
      eventId: 'event-1',
      userId: 'user-1',
      reason: 'remote_ahead',
    });

    expect(observeSyncHealth).toHaveBeenCalledTimes(1);
    const payload = observeSyncHealth.mock.calls[0][0];
    expect(payload.status).toBe('behind');
    expect(payload.prevRevision).toBe(12);
    expect(payload.localRevision).toBe(10);
    expect(observeSyncDrift).not.toHaveBeenCalled();
  });

  it('writes when remote behind and reports drift', async () => {
    const participantsQuery = createParticipantsQuery();
    const selectResult = async () => ({
      data: { round_revision: 5, scores_hash: 'remote-hash' },
      error: null,
    });
    const { select, upsert } = createEventScoresQuery(selectResult, async () => ({ error: null }));

    const supabase = {
      from(table: string) {
        if (table === 'event_participants') {
          return {
            select: vi.fn(() => participantsQuery),
          };
        }
        if (table === 'event_scores') {
          return {
            select,
            upsert,
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as Record<string, unknown>;

    setSupabaseClientOverride(supabase as any);

    const enqueueSync = vi.fn();
    const observeSyncHealth = vi.fn();
    const observeSyncDrift = vi.fn();

    __setEventSyncIntegrationsForTests({ enqueueSync, observeSyncHealth, observeSyncDrift });

    await pushHoleScore({
      eventId: 'event-2',
      roundId: 'round-1',
      hole: 7,
      gross: 5,
      par: 4,
      roundRevision: 7,
      scoresHash: 'local-hash',
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(enqueueSync).not.toHaveBeenCalled();

    expect(observeSyncDrift).toHaveBeenCalledTimes(1);
    const driftPayload = observeSyncDrift.mock.calls[0][0];
    expect(driftPayload.prevRevision).toBe(5);
    expect(driftPayload.localRevision).toBe(7);
    expect(driftPayload.prevHash).toBe('remote-hash');
    expect(driftPayload.localHash).toBe('local-hash');

    expect(observeSyncHealth).toHaveBeenCalledTimes(1);
    const healthPayload = observeSyncHealth.mock.calls[0][0];
    expect(healthPayload.status).toBe('ok');
  });

  it('writes new row when no previous record exists', async () => {
    const participantsQuery = createParticipantsQuery();
    const selectResult = async () => ({ data: null, error: null });
    const { select, upsert } = createEventScoresQuery(selectResult, async () => ({ error: null }));

    const supabase = {
      from(table: string) {
        if (table === 'event_participants') {
          return {
            select: vi.fn(() => participantsQuery),
          };
        }
        if (table === 'event_scores') {
          return {
            select,
            upsert,
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as Record<string, unknown>;

    setSupabaseClientOverride(supabase as any);

    const enqueueSync = vi.fn();
    const observeSyncHealth = vi.fn();
    const observeSyncDrift = vi.fn();

    __setEventSyncIntegrationsForTests({ enqueueSync, observeSyncHealth, observeSyncDrift });

    await pushHoleScore({
      eventId: 'event-3',
      roundId: 'round-1',
      hole: 2,
      gross: 3,
      par: 3,
      roundRevision: 1,
      scoresHash: 'hash-1',
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(enqueueSync).not.toHaveBeenCalled();
    expect(observeSyncDrift).not.toHaveBeenCalled();

    expect(observeSyncHealth).toHaveBeenCalledTimes(1);
    const healthPayload = observeSyncHealth.mock.calls[0][0];
    expect(healthPayload.status).toBe('ok');
    expect(healthPayload.prevRevision).toBeNull();
  });
});

