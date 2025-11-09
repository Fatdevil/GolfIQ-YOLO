import { describe, expect, it } from 'vitest';

import { buildSpectatorBoard } from '@shared/events/spectator';

describe('spectator leaderboard aggregation', () => {
  it('sorts by net score and earliest under-par momentum', () => {
    const board = buildSpectatorBoard([
      {
        name: 'Bea',
        gross: 70,
        net: 68,
        last_under_par_at: '2024-01-01T11:00:00Z',
        finished_at: '2024-01-01T11:30:00Z',
        thru: 18,
        hole: 18,
      },
      {
        name: 'Alice',
        gross: 70,
        net: 68,
        last_under_par_at: '2024-01-01T10:00:00Z',
        finished_at: '2024-01-01T12:00:00Z',
        thru: 18,
        hole: 18,
      },
      {
        name: 'Cara',
        gross: 72,
        net: 70,
        last_under_par_at: '2024-01-01T09:00:00Z',
        finished_at: '2024-01-01T12:30:00Z',
        thru: 18,
        hole: 18,
      },
    ]);
    expect(board.players.map((player) => player.name)).toEqual(['Alice', 'Bea', 'Cara']);
  });

  it('uses earliest finish time when under-par data is unavailable', () => {
    const board = buildSpectatorBoard([
      {
        name: 'Drew',
        gross: 70,
        net: 68,
        finished_at: '2024-01-02T10:30:00Z',
        thru: 18,
        hole: 18,
      },
      {
        name: 'Eli',
        gross: 70,
        net: 68,
        finished_at: '2024-01-02T10:05:00Z',
        thru: 18,
        hole: 18,
      },
    ]);
    expect(board.players.map((player) => player.name)).toEqual(['Eli', 'Drew']);
  });
});
