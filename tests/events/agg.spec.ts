import { describe, expect, it } from 'vitest';

import { buildBoard, type RoundLike, type SlopeCR } from '@shared/events/aggregate';

const slope: SlopeCR = {
  slope: 128,
  rating: 71.2,
  par: 72,
  strokeIndex: Array.from({ length: 18 }, (_, i) => i + 1),
  allowancePct: 95,
};

function sampleRounds(): RoundLike[] {
  return [
    {
      id: 'round-a',
      memberId: 'player-a',
      memberName: 'Alice',
      handicapIndex: 4.5,
      holes: [
        { hole: 1, gross: 4, net: 3, par: 4, toPar: 0, updatedAt: '2024-05-01T10:00:00Z' },
        { hole: 2, gross: 3, net: 2, par: 4, toPar: -1, updatedAt: '2024-05-01T10:08:00Z' },
        { hole: 3, gross: 5, net: 4, par: 5, toPar: 0, updatedAt: '2024-05-01T10:18:00Z' },
      ],
    },
    {
      id: 'round-b',
      memberId: 'player-b',
      memberName: 'Ben',
      handicapIndex: 9.2,
      holes: [
        { hole: 1, gross: 5, par: 4, toPar: 1, updatedAt: '2024-05-01T10:04:00Z' },
        { hole: 2, gross: 4, par: 4, toPar: 0, updatedAt: '2024-05-01T10:12:00Z' },
      ],
    },
  ];
}

describe('buildBoard', () => {
  it('aggregates gross/net/thru and sorts by net', () => {
    const board = buildBoard(sampleRounds(), slope);
    expect(board.players).toHaveLength(2);
    expect(board.players[0]).toMatchObject({
      id: 'player-b',
      name: 'Ben',
      gross: 9,
      net: 8,
      thru: 2,
      status: 'in_progress',
    });
    expect(board.players[1]).toMatchObject({
      id: 'player-a',
      name: 'Alice',
      gross: 12,
      net: 9,
      thru: 3,
      status: 'in_progress',
    });
    expect(board.players[1]!.hole).toBe(4);
    expect(board.updatedAt).toMatch(/T/);
  });

  it('uses tie-break on last under-par hole before finish time', () => {
    const rounds: RoundLike[] = [
      {
        id: 'r1',
        memberId: 'p1',
        memberName: 'Player One',
        holes: [
          { hole: 1, gross: 4, par: 4, toPar: 0 },
          { hole: 2, gross: 3, par: 4, toPar: -1 },
          { hole: 3, gross: 4, par: 4, toPar: 0 },
        ],
        finishedAt: '2024-05-01T11:00:00Z',
      },
      {
        id: 'r2',
        memberId: 'p2',
        memberName: 'Player Two',
        holes: [
          { hole: 1, gross: 4, par: 4, toPar: 0 },
          { hole: 2, gross: 4, par: 4, toPar: 0 },
          { hole: 3, gross: 3, par: 4, toPar: -1 },
        ],
        finishedAt: '2024-05-01T10:55:00Z',
      },
    ];
    const board = buildBoard(rounds);
    expect(board.players[0]!.id).toBe('p2');
    expect(board.players[0]!.status).toBe('finished');
    expect(board.players[0]!.hole).toBeNull();
  });

  it('omits non-spectator fields and keeps payload safe', () => {
    const board = buildBoard(sampleRounds());
    for (const player of board.players) {
      expect(Object.keys(player).sort()).toEqual(
        ['gross', 'hole', 'id', 'name', 'net', 'status', 'thru', 'toPar', 'updatedAt'].sort(),
      );
    }
  });
});

