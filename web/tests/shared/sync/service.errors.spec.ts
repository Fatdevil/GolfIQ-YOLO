import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoundState, ShotEvent } from '@shared/round/types';
import {
  __resetCloudSyncStateForTests,
  __setCloudSyncEnabledForTests,
  __setCloudSyncTelemetryForTests,
  __setSupabaseClientForTests,
  deleteShots,
  pushRound,
  pushShots,
} from '@shared/sync/service';

type SupabaseMocks = {
  roundUpsert: ReturnType<typeof vi.fn>;
  shotUpsert: ReturnType<typeof vi.fn>;
  deleteFactory: ReturnType<typeof vi.fn>;
  deleteIn: ReturnType<typeof vi.fn>;
  deleteMatch: ReturnType<typeof vi.fn>;
  client: {
    from: ReturnType<typeof vi.fn>;
    channel: ReturnType<typeof vi.fn>;
  };
};

function createSupabaseMocks(): SupabaseMocks {
  const roundUpsert = vi.fn(async () => ({ data: null, error: null }));
  const shotUpsert = vi.fn(async () => ({ data: null, error: null }));
  const deleteIn = vi.fn(async () => ({ data: null, error: null }));
  const deleteMatch = vi.fn(async () => ({ data: null, error: null }));
  const deleteFactory = vi.fn(() => ({ in: deleteIn, match: deleteMatch }));
  const from = vi.fn((table: string) => {
    if (table === 'round_states') {
      return {
        upsert: roundUpsert,
        select: vi.fn(),
      };
    }
    if (table === 'round_shots') {
      return {
        upsert: shotUpsert,
        delete: deleteFactory,
        select: vi.fn(),
      };
    }
    return {
      select: vi.fn(),
    };
  });
  const channel = vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(async () => ({ status: 'SUBSCRIBED' })),
    unsubscribe: vi.fn(async () => undefined),
  }));
  return { roundUpsert, shotUpsert, deleteFactory, deleteIn, deleteMatch, client: { from, channel } };
}

function sampleRound(): RoundState {
  return {
    id: 'round-1',
    courseId: 'course-1',
    startedAt: 1_000,
    currentHole: 1,
    holes: {
      1: { hole: 1, par: 4, shots: [] },
    },
    tournamentSafe: false,
  } as RoundState;
}

function sampleShot(id: string): ShotEvent {
  return {
    id,
    hole: 1,
    seq: 1,
    kind: 'Full',
    start: { lat: 0, lon: 0, ts: 1_000 },
    startLie: 'Fairway',
  } as ShotEvent;
}

describe('cloud sync error handling', () => {
  let supabase: SupabaseMocks;
  const telemetry = vi.fn();

  beforeEach(() => {
    supabase = createSupabaseMocks();
    __resetCloudSyncStateForTests();
    __setCloudSyncEnabledForTests(true);
    __setCloudSyncTelemetryForTests(telemetry);
    __setSupabaseClientForTests(supabase.client as unknown as any);
  });

  afterEach(() => {
    __setSupabaseClientForTests(null);
    __setCloudSyncEnabledForTests(null);
    __setCloudSyncTelemetryForTests(null);
    __resetCloudSyncStateForTests();
    telemetry.mockClear();
  });

  it('retries round upserts when Supabase errors', async () => {
    supabase.roundUpsert
      .mockResolvedValueOnce({ data: null, error: { code: '42501' } })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(pushRound(sampleRound())).rejects.toThrow(/round upsert failed/);
    expect(telemetry).toHaveBeenCalledWith('sync.error.round', expect.objectContaining({ id: 'round-1', code: '42501' }));

    await expect(pushRound(sampleRound())).resolves.toBeUndefined();
    await expect(pushRound(sampleRound())).resolves.toBeUndefined();

    expect(supabase.roundUpsert).toHaveBeenCalledTimes(2);
  });

  it('retries batched shot upserts when Supabase errors', async () => {
    supabase.shotUpsert
      .mockResolvedValueOnce({ data: null, error: { code: '42501' } })
      .mockResolvedValue({ data: null, error: null });

    await expect(pushShots('round-1', [sampleShot('shot-1')])).rejects.toThrow(/shot upsert failed/);
    expect(telemetry).toHaveBeenCalledWith(
      'sync.error.shots',
      expect.objectContaining({ roundId: 'round-1', code: '42501', n: 1 }),
    );

    await expect(pushShots('round-1', [sampleShot('shot-1')])).resolves.toBeUndefined();
    await expect(pushShots('round-1', [sampleShot('shot-1')])).resolves.toBeUndefined();

    expect(supabase.shotUpsert).toHaveBeenCalledTimes(2);
  });

  it('logs delete failures without throwing', async () => {
    supabase.deleteIn.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    supabase.deleteMatch.mockResolvedValueOnce({ data: null, error: { code: '42502' } });

    await expect(deleteShots('round-1', ['id:shot-1', 'seq:1:2'])).resolves.toBeUndefined();

    expect(telemetry).toHaveBeenCalledWith(
      'sync.error.delete.ids',
      expect.objectContaining({ roundId: 'round-1', n: 1, code: '42501' }),
    );
    expect(telemetry).toHaveBeenCalledWith(
      'sync.error.delete.seq',
      expect.objectContaining({ roundId: 'round-1', hole: 1, seq: 2, code: '42502' }),
    );
  });
});
