import { describe, expect, it } from 'vitest';

import { aggregateLeaderboard, computeNetSimple } from '@shared/events/scoring';
import type { ScoreRow } from '@shared/events/types';

describe('events scoring', () => {
  it('computes adjusted net scores based on handicap', () => {
    expect(computeNetSimple(72, 18, 18)).toBe(54);
    expect(computeNetSimple(40, 18, 9)).toBe(31);
    expect(computeNetSimple(30, 12, 9)).toBe(24);
  });

  it('aggregates leaderboard rows and sorts by net then gross then recency', () => {
    const now = Date.now();
    const rows: ScoreRow[] = [
      {
        event_id: 'e',
        user_id: 'a',
        hole_no: 1,
        gross: 5,
        net: 4,
        to_par: 1,
        stableford: 2,
        ts: new Date(now).toISOString(),
      },
      {
        event_id: 'e',
        user_id: 'b',
        hole_no: 1,
        gross: 5,
        net: 5,
        to_par: 1,
        stableford: 1,
        playing_handicap: 12,
        ts: new Date(now + 1000).toISOString(),
      },
      {
        event_id: 'e',
        user_id: 'a',
        hole_no: 2,
        gross: 4,
        net: 4,
        to_par: 0,
        stableford: 3,
        ts: new Date(now + 2000).toISOString(),
      },
    ];

    const names = { a: 'Alice', b: 'Bob' };
    const hcpIndexByUser = { a: 10, b: 20 };
    const holesPlayedByUser = { a: 2, b: 1 };
    const leaderboard = aggregateLeaderboard(rows, names, {
      hcpIndexByUser,
      holesPlayedByUser,
    });

    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0].user_id).toBe('b');
    expect(leaderboard[0].gross).toBe(5);
    expect(leaderboard[0].holes).toBe(1);
    expect(leaderboard[0].net).toBe(5);
    expect(leaderboard[0].stableford).toBe(1);
    expect(leaderboard[0].playing_handicap).toBe(12);
    expect(leaderboard[1].user_id).toBe('a');
    expect(leaderboard[1].net).toBe(8);
    expect(leaderboard[1].stableford).toBe(5);
  });

  it('falls back to handicap index when net values unavailable', () => {
    const user = 'u1';
    const rows: ScoreRow[] = Array.from({ length: 18 }, (_, index) => ({
      event_id: 'event',
      user_id: user,
      hole_no: index + 1,
      gross: 5,
      net: Number.NaN,
      to_par: 1,
      ts: `2025-01-01T00:${index.toString().padStart(2, '0')}:00Z`,
    }));
    const names = { [user]: 'Player A' };
    const hcpIndexByUser = { [user]: 12 };
    const holesPlayedByUser = { [user]: 18 };

    const leaderboard = aggregateLeaderboard(rows, names, {
      hcpIndexByUser,
      holesPlayedByUser,
    });

    expect(leaderboard[0].gross).toBe(90);
    expect(leaderboard[0].net).toBe(78);
    expect(leaderboard[0].playing_handicap).toBeUndefined();
  });
});
