import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../setupSupabaseMock';

import type { RoundState } from '../../../shared/round/types';
import {
  __resetCloudSyncStateForTests,
  __setCloudSyncEnabledForTests,
  isEnabled,
  pushRound,
} from '../../../shared/sync/service';
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
});
