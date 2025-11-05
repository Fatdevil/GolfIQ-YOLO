import { afterEach, describe, expect, it, vi } from 'vitest';

import { pollScores, pushHoleScore } from '@shared/events/service';
import type { ScoreRow } from '@shared/events/types';
import { setSupabaseClientOverride, type SupabaseClientLike } from '@shared/supabase/client';

describe('events service mapping', () => {
  afterEach(() => {
    setSupabaseClientOverride(null);
  });

  it('resolves participant user_id before pushing scores', async () => {
    const fakeClient: SupabaseClientLike = {
      from: vi.fn((table: string) => {
        if (table === 'event_participants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ user_id: 'user-1' }] }) }),
              }),
            }),
          };
        }
        if (table === 'event_scores') {
          return {
            upsert: vi.fn().mockReturnValue({ error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClientLike;
    setSupabaseClientOverride(fakeClient);

    await pushHoleScore({ eventId: 'event', roundId: 'round', hole: 1, gross: 5 });

    expect(fakeClient.from).toHaveBeenCalledWith('event_scores');
  });

  it('polls scores and yields rows', async () => {
    const rows: ScoreRow[] = [
      {
        event_id: 'event',
        user_id: 'user',
        hole_no: 1,
        gross: 5,
        net: 5,
        to_par: 1,
        ts: new Date().toISOString(),
      },
    ];
    const stop = vi.fn();

    const fakeClient: SupabaseClientLike = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(Promise.resolve({ data: rows })),
        }),
      })),
    } as unknown as SupabaseClientLike;
    setSupabaseClientOverride(fakeClient);

    const received: ScoreRow[][] = [];
    const unsubscribe = await pollScores('event', (next) => {
      received.push(next);
    }, 5);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(rows);

    unsubscribe();
    expect(stop).not.toHaveBeenCalled();
  });
});
