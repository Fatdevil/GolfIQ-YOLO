import { describe, expect, it } from 'vitest';

import { computeLeaderboard, type EventState, type EventFormat } from '../../shared/event/models';
import type { SharedRoundV1 } from '../../shared/event/payload';

type RoundOptions = {
  playerName: string;
  playerHcp?: number;
  netRelative?: number[];
  netTotal?: number;
  sgPerHole?: number[];
};

function makeRound(roundId: string, playerId: string, strokes: number[], options: RoundOptions): SharedRoundV1 {
  const gross = strokes.reduce((sum, value) => sum + value, 0);
  const holeCount = strokes.length;
  const netRelative = options.netRelative ?? strokes.map((value) => value - 4);
  const sgPerHole = options.sgPerHole;
  const holesBreakdown = strokes.map((strokesValue, idx) => ({
    h: idx + 1,
    strokes: strokesValue,
    net: netRelative[idx] ?? undefined,
    sg: sgPerHole ? sgPerHole[idx] : undefined,
  }));
  const totalSg = sgPerHole?.reduce((sum, value) => sum + value, 0);
  return {
    v: 1,
    roundId,
    player: { id: playerId, name: options.playerName, hcp: options.playerHcp },
    courseId: 'course-1',
    holes: { start: 1, end: holeCount },
    gross,
    net: options.netTotal,
    sg: totalSg,
    holesBreakdown,
  };
}

function buildEvent(format: EventFormat): EventState {
  const alphaRound = makeRound(
    'round-alpha',
    'alpha',
    new Array(18).fill(4),
    {
      playerName: 'Alpha',
      playerHcp: 0,
      sgPerHole: new Array(18).fill(0.05),
    },
  );

  const bravoRound = makeRound(
    'round-bravo',
    'bravo',
    [5, 5, 5, 5, 5, 5, 5, 5, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4],
    {
      playerName: 'Bravo',
      playerHcp: 0,
      netRelative: [
        1, 1, 1, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0,
      ],
      sgPerHole: new Array(18).fill(0.03),
    },
  );

  const charlieRound = makeRound(
    'round-charlie',
    'charlie',
    [6, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3],
    {
      playerName: 'Charlie',
      playerHcp: 8,
      netRelative: [
        2, 1, 1, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      ],
      netTotal: 72,
      sgPerHole: new Array(18).fill(0),
    },
  );

  return {
    id: 'event-1',
    name: 'Club Event',
    format,
    holes: { start: 1, end: 18 },
    participants: {
      alpha: { id: 'alpha', name: 'Alpha', hcp: 0, rounds: { [alphaRound.roundId]: alphaRound } },
      bravo: { id: 'bravo', name: 'Bravo', hcp: 0, rounds: { [bravoRound.roundId]: bravoRound } },
      charlie: { id: 'charlie', name: 'Charlie', hcp: 8, rounds: { [charlieRound.roundId]: charlieRound } },
    },
    createdAt: 0,
    courseId: 'course-1',
  };
}

describe('computeLeaderboard', () => {
  it('sorts by gross with last-nine tie break', () => {
    const event = buildEvent('gross');
    const rows = computeLeaderboard(event);
    expect(rows.map((row) => row.participantId)).toEqual(['bravo', 'alpha', 'charlie']);
    expect(rows[0]).toMatchObject({ rank: 1, gross: 72 });
    expect(rows[1]).toMatchObject({ rank: 2, gross: 72 });
    expect(rows[2]).toMatchObject({ rank: 3, gross: 80 });
  });

  it('sorts by net including handicap adjustment', () => {
    const event = buildEvent('net');
    const rows = computeLeaderboard(event);
    expect(rows[0].participantId).toBe('charlie');
    expect(rows[0].net).toBe(72);
    expect(rows[1].participantId).toBe('bravo');
    expect(rows[2].participantId).toBe('alpha');
  });

  it('sorts stableford descending with tie break on last segments', () => {
    const event = buildEvent('stableford');
    const rows = computeLeaderboard(event);
    expect(rows.map((row) => row.participantId)).toEqual(['charlie', 'bravo', 'alpha']);
    expect(rows[0].stableford).toBe(36);
    expect(rows[1].stableford).toBe(36);
    expect(rows[2].stableford).toBe(36);
  });
});

