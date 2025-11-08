import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../setupSupabaseMock';

import type { RoundState } from '../../../shared/round/types';
import {
  __resetCloudSyncStateForTests,
  __setCloudSyncEnabledForTests,
  __setCloudSyncTelemetryForTests,
  isEnabled,
  pushRound,
  pushHudSnapshot,
} from '../../../shared/sync/service';
import type { HudSnapshot } from '../../../shared/sync/service';
import { createClient } from '@supabase/supabase-js';

function sampleRound(id = 'round-1'): RoundState {
  return {
    id,
    courseId: 'course-xyz',
    startedAt: Date.now(),
    holes: {
      1: { hole: 1, par: 4, shots: [] },
    },
    currentHole: 1,
    tournamentSafe: false,
  };
}

function sampleHudSnapshot(overrides: Partial<HudSnapshot> = {}) {
  return {
    roundId: 'round-1',
    holeId: 1,
    version: 'v1',
    deviceId: 'device-1',
    payload: { foo: 'bar', nested: { alpha: 1, beta: [1, 2, 3] } },
    ...overrides,
  };
}

describe('cloud sync service', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    __resetCloudSyncStateForTests();
    __setCloudSyncEnabledForTests(true);
    (createClient as unknown as vi.Mock).mockClear();
  });

  afterEach(() => {
    __setCloudSyncEnabledForTests(null);
    __setCloudSyncTelemetryForTests(null);
    __resetCloudSyncStateForTests();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.CLOUD_SYNC_ENABLED;
    (createClient as unknown as vi.Mock).mockClear();
  });

  it('upserts a round once even when pushed repeatedly', async () => {
    const round = sampleRound();
    await pushRound(round);
    await pushRound(round);

    const clientMock = (createClient as unknown as vi.Mock).mock.results[0]?.value as {
      from: vi.Mock;
    } | undefined;
    expect(clientMock).toBeTruthy();
    if (!clientMock) {
      throw new Error('Supabase client was not created');
    }
    expect(clientMock.from).toHaveBeenCalledTimes(1);
    const upsertMock = clientMock.from.mock.results[0]?.value.upsert as vi.Mock | undefined;
    expect(upsertMock).toBeTruthy();
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('skips supabase when sync is disabled', async () => {
    __resetCloudSyncStateForTests();
    __setCloudSyncEnabledForTests(false);
    expect(isEnabled()).toBe(false);

    await pushRound(sampleRound('round-disabled'));

    expect((createClient as unknown as vi.Mock).mock.calls.length).toBe(0);
  });

  describe('pushHudSnapshot', () => {
    it('respects env gate default', async () => {
      __resetCloudSyncStateForTests();
      __setCloudSyncEnabledForTests(null);
      delete process.env.CLOUD_SYNC_ENABLED;

      await pushHudSnapshot(sampleHudSnapshot());

      expect((createClient as unknown as vi.Mock).mock.calls.length).toBe(0);
    });

    it('upserts snapshot with fingerprint conflict handling', async () => {
      __resetCloudSyncStateForTests();
      __setCloudSyncEnabledForTests(null);
      process.env.CLOUD_SYNC_ENABLED = 'true';

      await pushHudSnapshot(sampleHudSnapshot({ roundId: 'round-insert' }));

      const clientMock = (createClient as unknown as vi.Mock).mock.results[0]?.value as { from: vi.Mock } | undefined;
      expect(clientMock).toBeTruthy();
      if (!clientMock) throw new Error('Supabase client not created');
      const fromResults = clientMock.from.mock.results;
      expect(fromResults.length).toBeGreaterThanOrEqual(1);
      const upsertMock = fromResults[fromResults.length - 1]?.value.upsert as vi.Mock | undefined;
      expect(upsertMock).toBeTruthy();
      if (!upsertMock) throw new Error('Upsert mock missing');
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ fp_hash: expect.any(String) }),
        expect.objectContaining({ onConflict: 'fp_hash', ignoreDuplicates: true }),
      );
    });

    it('produces identical fingerprints for duplicate payloads', async () => {
      __resetCloudSyncStateForTests();
      __setCloudSyncEnabledForTests(null);
      process.env.CLOUD_SYNC_ENABLED = 'true';

      await pushHudSnapshot(sampleHudSnapshot({ payload: { foo: 'bar' } }));
      await pushHudSnapshot(sampleHudSnapshot({ payload: { foo: 'bar' } }));

      const clientMock = (createClient as unknown as vi.Mock).mock.results[0]?.value as { from: vi.Mock } | undefined;
      expect(clientMock).toBeTruthy();
      if (!clientMock) throw new Error('Supabase client not created');
      const fromResults = clientMock.from.mock.results;
      expect(fromResults.length).toBeGreaterThanOrEqual(2);
      const firstUpsert = fromResults[fromResults.length - 2]?.value.upsert as vi.Mock | undefined;
      const secondUpsert = fromResults[fromResults.length - 1]?.value.upsert as vi.Mock | undefined;
      expect(firstUpsert).toBeTruthy();
      expect(secondUpsert).toBeTruthy();
      if (!firstUpsert || !secondUpsert) throw new Error('Upsert mock missing');
      const firstHash = firstUpsert.mock.calls[0]?.[0]?.fp_hash;
      const secondHash = secondUpsert.mock.calls[0]?.[0]?.fp_hash;
      expect(firstHash).toBe(secondHash);
    });

    it('fingerprint remains stable regardless of property order', async () => {
      __resetCloudSyncStateForTests();
      __setCloudSyncEnabledForTests(null);
      process.env.CLOUD_SYNC_ENABLED = 'true';

      await pushHudSnapshot(sampleHudSnapshot({ payload: { foo: 'bar', nested: { alpha: 1, beta: [1, 2] } } }));
      await pushHudSnapshot(
        sampleHudSnapshot({ payload: { nested: { beta: [1, 2], alpha: 1 }, foo: 'bar' } }),
      );

      const clientMock = (createClient as unknown as vi.Mock).mock.results[0]?.value as { from: vi.Mock } | undefined;
      expect(clientMock).toBeTruthy();
      if (!clientMock) throw new Error('Supabase client not created');
      const fromResults = clientMock.from.mock.results;
      expect(fromResults.length).toBeGreaterThanOrEqual(2);
      const firstUpsert = fromResults[fromResults.length - 2]?.value.upsert as vi.Mock | undefined;
      const secondUpsert = fromResults[fromResults.length - 1]?.value.upsert as vi.Mock | undefined;
      expect(firstUpsert).toBeTruthy();
      expect(secondUpsert).toBeTruthy();
      if (!firstUpsert || !secondUpsert) throw new Error('Upsert mock missing');
      const firstHash = firstUpsert.mock.calls[0]?.[0]?.fp_hash;
      const secondHash = secondUpsert.mock.calls[0]?.[0]?.fp_hash;
      expect(firstHash).toBe(secondHash);
    });

    it('emits telemetry for success and failures', async () => {
      __resetCloudSyncStateForTests();
      __setCloudSyncEnabledForTests(null);
      process.env.CLOUD_SYNC_ENABLED = 'true';
      const telemetryMock = vi.fn();
      __setCloudSyncTelemetryForTests(telemetryMock);

      await pushHudSnapshot(sampleHudSnapshot({ payload: { foo: 'baz' } }));
      const clientMock = (createClient as unknown as vi.Mock).mock.results[0]?.value as { from: vi.Mock } | undefined;
      expect(clientMock).toBeTruthy();
      if (!clientMock) throw new Error('Supabase client not created');
      clientMock.from.mockImplementationOnce(() => ({
        upsert: vi.fn(async () => ({ error: { code: 'hud-snap-fail', message: 'boom' } })),
      }));

      await pushHudSnapshot(sampleHudSnapshot({ payload: { foo: 'error-case' } }));

      expect(telemetryMock).toHaveBeenCalledWith('sync.hud_snapshot_push_ms', expect.any(Object));
      expect(telemetryMock).toHaveBeenCalledWith(
        'sync_error',
        expect.objectContaining({ type: 'hud_snapshot' }),
      );
    });
  });
});
