import { describe, expect, it } from 'vitest';

import { aggregateLeaderboard, computeNetSimple } from '../../../shared/events/scoring';
import type { ScoreRow } from '../../../shared/events/types';

describe('computeNetSimple', () => {
  it('adjusts handicap proportionally for 18 holes', () => {
    expect(computeNetSimple(90, 12, 18)).toBe(78);
  });

  it('rounds handicap adjustment for 9 holes', () => {
    expect(computeNetSimple(45, 12, 9)).toBe(39);
  });

  it('handles partial rounds (12 holes)', () => {
    expect(computeNetSimple(60, 15, 12)).toBe(50);
  });
});

describe('aggregateLeaderboard', () => {
  const baseRows: ScoreRow[] = [
    {
      event_id: 'event-1',
      user_id: 'user-a',
      hole_no: 1,
      gross: 4,
      net: 3,
      to_par: 0,
      ts: '2025-01-01T10:00:00Z',
    },
    {
      event_id: 'event-1',
      user_id: 'user-b',
      hole_no: 1,
      gross: 4,
      net: 4,
      to_par: 0,
      ts: '2025-01-01T10:01:00Z',
    },
    {
      event_id: 'event-1',
      user_id: 'user-a',
      hole_no: 2,
      gross: 5,
      net: 4,
      to_par: 1,
      ts: '2025-01-01T10:05:00Z',
    },
    {
      event_id: 'event-1',
      user_id: 'user-b',
      hole_no: 2,
      gross: 4,
      net: 3,
      to_par: 0,
      ts: '2025-01-01T10:04:00Z',
    },
  ];

  it('sums gross, net, and toPar per player', () => {
    const names = { 'user-a': 'Alice', 'user-b': 'Bob' };
    const holes = { 'user-a': 2, 'user-b': 2 };
    const leaderboard = aggregateLeaderboard(baseRows, names, holes);
    expect(leaderboard).toEqual([
      {
        user_id: 'user-b',
        display_name: 'Bob',
        holes: 2,
        gross: 8,
        net: 7,
        to_par: 0,
        last_ts: '2025-01-01T10:04:00Z',
      },
      {
        user_id: 'user-a',
        display_name: 'Alice',
        holes: 2,
        gross: 9,
        net: 7,
        to_par: 1,
        last_ts: '2025-01-01T10:05:00Z',
      },
    ]);
  });

  it('sorts by net, then gross, then latest timestamp', () => {
    const names = { 'user-a': 'Alice', 'user-b': 'Bob' };
    const holes = { 'user-a': 2, 'user-b': 2 };
    const leaderboard = aggregateLeaderboard(
      [
        ...baseRows,
        {
          event_id: 'event-1',
          user_id: 'user-c',
          hole_no: 1,
          gross: 3,
          net: 3,
          to_par: -1,
          ts: '2025-01-01T09:59:00Z',
        },
      ],
      { ...names, 'user-c': 'Cara' },
      { ...holes, 'user-c': 1 },
    );
    expect(leaderboard.map((row) => row.user_id)).toEqual(['user-c', 'user-b', 'user-a']);
  });

  it('respects provided holes played map when data missing', () => {
    const names = { 'user-a': 'Alice' };
    const holes = { 'user-a': 5 };
    const leaderboard = aggregateLeaderboard(baseRows.slice(0, 1), names, holes);
    expect(leaderboard[0].holes).toBe(5);
  });
});
