import { describe, expect, it } from 'vitest';

import { DEFAULT_STROKES_GAINED_BASELINE, computeStrokesGainedLight } from '../stats/strokesGainedLight';
import type { ShotEvent } from '../round/types';

const baseShot: ShotEvent = {
  id: 's1',
  hole: 1,
  seq: 1,
  start: { lat: 0, lon: 0, ts: 0 },
  startLie: 'Tee',
  kind: 'Full',
};

describe('computeStrokesGainedLight', () => {
  it('returns zeros when missing data', () => {
    const result = computeStrokesGainedLight([], DEFAULT_STROKES_GAINED_BASELINE);
    expect(result.totalDelta).toBe(0);
    expect(result.byCategory).toEqual([]);
  });

  it('buckets tee shots by par', () => {
    const shots: ShotEvent[] = [
      { ...baseShot, par: 4, toPinStart_m: 380 },
      { ...baseShot, id: 's2', par: 5, toPinStart_m: 520 },
    ];

    const result = computeStrokesGainedLight(shots, DEFAULT_STROKES_GAINED_BASELINE);

    const tee = result.byCategory.find((c) => c.category === 'tee');
    expect(tee?.shots).toBe(2);
    expect(result.totalDelta).toBeLessThan(0); // two strokes taken from tee positions
  });

  it('treats close lies as short game and greens as putting', () => {
    const shots: ShotEvent[] = [
      {
        ...baseShot,
        id: 'app1',
        startLie: 'Fairway',
        toPinStart_m: 120,
        toPinEnd_m: 8,
      },
      {
        ...baseShot,
        id: 'chip',
        startLie: 'Rough',
        toPinStart_m: 15,
        toPinEnd_m: 3,
        kind: 'Chip',
      },
      {
        ...baseShot,
        id: 'putt',
        startLie: 'Green',
        toPinStart_m: 4,
        toPinEnd_m: 0,
        kind: 'Putt',
      },
    ];

    const result = computeStrokesGainedLight(shots, DEFAULT_STROKES_GAINED_BASELINE);
    const app = result.byCategory.find((c) => c.category === 'approach');
    const shortGame = result.byCategory.find((c) => c.category === 'short_game');
    const putting = result.byCategory.find((c) => c.category === 'putting');

    expect(app?.shots).toBe(1);
    expect(shortGame?.shots).toBe(1);
    expect(putting?.shots).toBe(1);
  });
});

