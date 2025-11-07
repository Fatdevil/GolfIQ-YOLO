import { describe, expect, it } from 'vitest';

import type { HandicapSetup } from '@shared/whs/types';
import { computeNetForRound } from '@shared/events/net';

describe('computeNetForRound', () => {
  it('computes net scoring for 18 holes with stroke index provided', () => {
    const setup: HandicapSetup = {
      handicapIndex: 12.3,
      allowancePct: 95,
      tee: {
        id: 'blue',
        name: 'Blue',
        slope: 125,
        rating: 71.2,
        par: 72,
        strokeIndex: Array.from({ length: 18 }, (_, i) => i + 1),
      },
    };

    const holes = Array.from({ length: 18 }, (_, i) => ({
      hole: i + 1,
      par: 4,
      gross: 5,
    }));

    const result = computeNetForRound(setup, holes);

    expect(result.courseHandicap).toBe(13);
    expect(result.playingHandicap).toBe(12);
    expect(result.strokesPerHole).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
    ]);
    expect(result.holes[0]).toEqual({ hole: 1, gross: 5, net: 4, points: 2 });
    expect(result.holes[17]).toEqual({ hole: 18, gross: 5, net: 5, points: 1 });
    expect(result.totalNet).toBe(78);
    expect(result.totalPoints).toBe(30);
  });

  it('computes net scoring for 9 holes without stroke index fallback', () => {
    const setup: HandicapSetup = {
      handicapIndex: 8,
      allowancePct: 100,
      tee: {
        id: 'white-front',
        name: 'White Front',
        slope: 120,
        rating: 36,
        par: 36,
      },
    };

    const holes = Array.from({ length: 9 }, (_, i) => ({
      hole: i + 1,
      par: i % 2 === 0 ? 4 : 3,
      gross: i % 2 === 0 ? 5 : 4,
    }));

    const result = computeNetForRound(setup, holes);

    expect(result.courseHandicap).toBe(8);
    expect(result.playingHandicap).toBe(8);
    expect(result.strokesPerHole.slice(0, 8).every((s) => s === 1)).toBe(true);
    expect(result.strokesPerHole[8]).toBe(0);
    expect(result.holes[0].net).toBe(4);
    expect(result.holes[0].points).toBe(2);
    expect(result.holes[8].net).toBe(5);
    expect(result.totalPoints).toBeGreaterThan(0);
  });
});
