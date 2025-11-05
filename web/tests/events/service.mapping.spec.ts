import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pollScores, pushHoleScore } from '../../../shared/events/service';
import type { ScoreRow } from '../../../shared/events/types';
import { setSupabaseClientOverride } from '../../../shared/supabase/client';

type ParticipantRow = {
  event_id: string;
  user_id: string;
  round_id: string;
};

type ScoreState = {
  event_id: string;
  user_id: string;
  hole_no: number;
  gross: number;
  net: number;
  to_par: number;
  ts: string;
};

describe('events service', () => {
  const participants: ParticipantRow[] = [
    { event_id: 'event-1', user_id: 'user-99', round_id: 'round-1' },
  ];
  const scores: ScoreState[] = [
    {
      event_id: 'event-1',
      user_id: 'user-77',
      hole_no: 1,
      gross: 4,
      net: 4,
      to_par: 0,
      ts: '2025-01-01T10:00:00Z',
    },
  ];
  const upsertCalls: any[] = [];

  const supabaseStub = {
    from(table: string) {
      if (table === 'event_participants') {
        const filters: Record<string, string> = {};
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string) {
            filters[column] = value;
            return builder;
          },
          limit() {
            const match = participants.find((row) =>
              Object.entries(filters).every(([key, value]) => (row as Record<string, string>)[key] === value),
            );
            return Promise.resolve({ data: match ? [match] : [], error: null });
          },
        };
        return builder;
      }
      if (table === 'event_scores') {
        return {
          select() {
            return {
              eq(_column: string, value: string) {
                const rows = scores.filter((row) => row.event_id === value);
                return Promise.resolve({ data: rows, error: null });
              },
            };
          },
          async upsert(payload: any) {
            const index = scores.findIndex(
              (row) =>
                row.event_id === payload.event_id &&
                row.user_id === payload.user_id &&
                row.hole_no === payload.hole_no,
            );
            if (index >= 0) {
              scores[index] = { ...scores[index], ...payload };
            } else {
              scores.push(payload);
            }
            upsertCalls.push(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  beforeEach(() => {
    upsertCalls.length = 0;
    scores.length = 0;
    scores.push({
      event_id: 'event-1',
      user_id: 'user-77',
      hole_no: 1,
      gross: 4,
      net: 4,
      to_par: 0,
      ts: '2025-01-01T10:00:00Z',
    });
    setSupabaseClientOverride(supabaseStub as any);
  });

  afterEach(() => {
    setSupabaseClientOverride(null);
    vi.useRealTimers();
  });

  it('maps round to participant user id when pushing scores', async () => {
    await pushHoleScore({
      eventId: 'event-1',
      roundId: 'round-1',
      hole: 3,
      gross: 5,
      hcpIndex: 12,
    });
    expect(upsertCalls).toHaveLength(1);
    const payload = upsertCalls[0];
    expect(payload.event_id).toBe('event-1');
    expect(payload.user_id).toBe('user-99');
    expect(payload.hole_no).toBe(3);
    expect(payload.gross).toBe(5);
    expect(payload.net).toBe(5);
  });

  it('polls scores and invokes callback with latest rows', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const stop = await pollScores('event-1', callback, 100);
    expect(callback).toHaveBeenCalledTimes(1);
    const firstArg = callback.mock.calls[0][0] as ScoreRow[];
    expect(firstArg[0]?.user_id).toBe('user-77');

    await vi.advanceTimersByTimeAsync(120);
    expect(callback).toHaveBeenCalledTimes(2);
    stop();
  });
});
