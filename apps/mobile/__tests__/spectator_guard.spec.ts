import { describe, expect, it } from 'vitest';

import { sanitizePlayers } from '@app/screens/EventLiveScreen';

describe('EventLiveScreen spectator guard', () => {
  it('returns only allowed fields for each player', () => {
    const players = [
      {
        name: 'Alice',
        gross: 72,
        net: 70,
        thru: 18,
        hole: 18,
        status: 'finished',
        coachNotes: 'keep calm',
        caddie: 'Bob',
      },
    ];
    const sanitized = sanitizePlayers(players as any);
    expect(sanitized).toHaveLength(1);
    expect(Object.keys(sanitized[0]!)).toEqual(['name', 'gross', 'net', 'thru', 'hole', 'status']);
    expect(sanitized[0]).toMatchObject({
      name: 'Alice',
      gross: 72,
      net: 70,
      thru: 18,
      hole: 18,
      status: 'finished',
    });
  });

  it('fills defaults when fields are missing', () => {
    const players = [{ name: null, gross: null, thru: null, hole: undefined }];
    const sanitized = sanitizePlayers(players as any);
    expect(sanitized[0]).toMatchObject({
      name: 'Player 1',
      gross: 0,
      net: null,
      thru: 0,
      hole: 0,
      status: null,
    });
  });
});
