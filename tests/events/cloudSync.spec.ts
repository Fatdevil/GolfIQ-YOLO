import { beforeEach, describe, expect, it } from 'vitest';

import '../setupSupabaseMock';

import type { SharedRoundV1 } from '../../shared/event/payload';
import {
  __mock,
  createEvent,
  joinEvent,
  postSharedRound,
  watchEvent,
} from '../../golfiq/app/src/cloud/eventsSync';
import { mockSupa } from '../../golfiq/app/src/cloud/mockSupabase';
import {
  CloudSyncError,
  __setSupabaseClientForTests,
  upsertOrThrow,
} from '../../golfiq/app/src/cloud/supabaseSafe';

function sampleRound(playerId: string, roundId: string, options: { gross: number; hcp?: number; holes?: { start: number; end: number }; net?: number }): SharedRoundV1 {
  return {
    v: 1,
    roundId,
    player: {
      id: playerId,
      name: `Player ${playerId}`,
      hcp: options.hcp,
    },
    courseId: 'course-1',
    holes: options.holes ?? { start: 1, end: 18 },
    gross: options.gross,
    net: options.net,
    sg: undefined,
    holesBreakdown: [],
  };
}

describe('events cloud sync (mock backend)', () => {
  beforeEach(() => {
    __mock.reset();
    __mock.setUser('host');
  });

  it('auto-enrolls host as member when creating event', async () => {
    const { id } = await createEvent('Club Night', { start: 1, end: 18 }, 'gross');
    await expect(postSharedRound(id, sampleRound('host', 'round-1', { gross: 72 }))).resolves.toEqual({ ok: true });
  });

  it('joinEvent adds a member using join code', async () => {
    const { id, joinCode } = await createEvent('Scramble', { start: 1, end: 18 }, 'gross');
    __mock.setUser('guest');
    const joined = await joinEvent(joinCode);
    expect(joined?.id).toBe(id);
    await expect(postSharedRound(id, sampleRound('guest', 'round-2', { gross: 70 }))).resolves.toEqual({ ok: true });
  });

  it('scales handicap for partial rounds when posting shared rounds', async () => {
    const { id } = await createEvent('Nine', { start: 1, end: 9 }, 'net');
    let unsubscribe: (() => void) | null = null;
    const emission = new Promise<SharedRoundV1[]>((resolve) => {
      void watchEvent(id, (rows) => {
        if (rows.length) {
          resolve(rows);
        }
      }).then((fn) => {
        unsubscribe = fn;
      });
    });
    await postSharedRound(id, sampleRound('host', 'round-3', { gross: 45, hcp: 18, holes: { start: 1, end: 9 } }));
    const rows = await emission;
    expect(rows[0]?.net).toBe(36);
    if (unsubscribe) {
      await unsubscribe();
    }
  });

  it('watchEvent emits when a round is upserted', async () => {
    const { id } = await createEvent('League', { start: 1, end: 18 }, 'gross');
    let unsubscribe: (() => void) | null = null;
    const emission = new Promise<SharedRoundV1[]>((resolve) => {
      void watchEvent(id, (rows) => {
        if (rows.some((row) => row.roundId === 'round-4')) {
          resolve(rows);
        }
      }).then((fn) => {
        unsubscribe = fn;
      });
    });
    await postSharedRound(id, sampleRound('host', 'round-4', { gross: 75 }));
    const rows = await emission;
    expect(rows.some((row) => row.roundId === 'round-4')).toBe(true);
    if (unsubscribe) {
      await unsubscribe();
    }
  });
});
  it('throws CloudSyncError with code/status on RLS error', async () => {
    mockSupa.reset();
    __setSupabaseClientForTests(mockSupa.client);
    try {
      mockSupa.setNextUpsertError('event_rounds', {
        message: 'RLS denied',
        status: 401,
        code: '42501',
      });
      await expect(upsertOrThrow('event_rounds', { foo: 'bar' })).rejects.toBeInstanceOf(CloudSyncError);
      mockSupa.setNextUpsertError('event_rounds', {
        message: 'RLS denied',
        status: 401,
        code: '42501',
      });
      await expect(upsertOrThrow('event_rounds', { foo: 'bar' })).rejects.toMatchObject({
        message: 'RLS denied',
        status: 401,
        code: '42501',
      });
    } finally {
      __setSupabaseClientForTests(null);
    }
  });

  it('postSharedRound returns {ok:false} when backend rejects', async () => {
    const { id } = await createEvent('League Fail', { start: 1, end: 18 }, 'gross');
    mockSupa.setNextUpsertError('event_rounds', {
      message: 'Bad row',
      status: 400,
      code: '22P02',
    });
    const result = await postSharedRound(id, sampleRound('host', 'round-err', { gross: 80 }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Bad row/);
    expect(result.status).toBe(400);
    expect(result.code).toBe('22P02');
  });
