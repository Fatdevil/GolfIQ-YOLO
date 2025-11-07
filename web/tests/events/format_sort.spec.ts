import { describe, expect, it } from 'vitest';

import { aggregateLeaderboard } from '@shared/events/scoring';
import type { ScoreRow } from '@shared/events/types';

describe('events leaderboard formats', () => {
  it('uses points and gross tie-breakers for stableford events', () => {
    const base = Date.parse('2025-01-01T00:00:00Z');
    const rows: ScoreRow[] = [
      {
        event_id: 'event',
        user_id: 'player-a',
        hole_no: 1,
        gross: 5,
        net: 4,
        to_par: 1,
        stableford: 2,
        playing_handicap: 11,
        ts: new Date(base).toISOString(),
      },
      {
        event_id: 'event',
        user_id: 'player-a',
        hole_no: 2,
        gross: 4,
        net: 4,
        to_par: 0,
        stableford: 2,
        ts: new Date(base + 2000).toISOString(),
      },
      {
        event_id: 'event',
        user_id: 'player-b',
        hole_no: 1,
        gross: 6,
        net: 5,
        to_par: 2,
        stableford: 3,
        ts: new Date(base + 1000).toISOString(),
      },
      {
        event_id: 'event',
        user_id: 'player-b',
        hole_no: 2,
        gross: 4,
        net: 4,
        to_par: 0,
        stableford: 2,
        ts: new Date(base + 3000).toISOString(),
      },
    ];

    const leaderboard = aggregateLeaderboard(
      rows,
      { 'player-a': 'Alice', 'player-b': 'Bruno' },
      { format: 'stableford' },
    );

    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0].user_id).toBe('player-b');
    expect(leaderboard[0].stableford).toBe(5);
    expect(leaderboard[1].stableford).toBe(4);
    expect(leaderboard[0].gross).toBe(10);
    expect(leaderboard[0].hasStableford).toBe(true);
    expect(leaderboard[0].playing_handicap).toBeUndefined();
    expect(leaderboard[1].playing_handicap).toBe(11);
  });

  it('sorts by net then gross for stroke events', () => {
    const now = Date.parse('2025-06-01T10:00:00Z');
    const rows: ScoreRow[] = [
      {
        event_id: 'event',
        user_id: 'stroke-a',
        hole_no: 1,
        gross: 4,
        net: 3,
        to_par: 0,
        ts: new Date(now).toISOString(),
      },
      {
        event_id: 'event',
        user_id: 'stroke-b',
        hole_no: 1,
        gross: 3,
        net: 4,
        to_par: -1,
        ts: new Date(now + 500).toISOString(),
      },
    ];

    const leaderboard = aggregateLeaderboard(
      rows,
      { 'stroke-a': 'Sasha', 'stroke-b': 'Bex' },
      { format: 'stroke' },
    );

    expect(leaderboard[0].user_id).toBe('stroke-a');
    expect(leaderboard[0].net).toBe(3);
    expect(leaderboard[0].gross).toBe(4);
    expect(leaderboard[0].hasStableford).toBe(false);
    expect(leaderboard[1].net).toBe(4);
    expect(leaderboard[1].gross).toBe(3);
  });
});
