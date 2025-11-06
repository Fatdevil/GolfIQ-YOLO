import { describe, expect, it } from 'vitest';

import {
  allocateStrokes,
  courseHandicap,
  netStrokes,
  playingHandicap,
  stablefordPoints,
} from '@shared/whs/calc';
import type { TeeRating } from '@shared/whs/types';

const baseTee: TeeRating = {
  id: 'tee-1',
  name: 'Blue',
  slope: 125,
  rating: 71.2,
  par: 72,
  strokeIndex: Array.from({ length: 18 }, (_, i) => i + 1),
};

describe('WHS core calculations', () => {
  it('computes course handicap and playing handicap', () => {
    const ch = courseHandicap(12.3, baseTee);
    expect(ch).toBe(13);

    const ph = playingHandicap(ch, 95);
    expect(ph).toBe(12);
  });

  it('allocates strokes across holes', () => {
    const strokes = allocateStrokes(13, baseTee.strokeIndex!);
    expect(strokes).toHaveLength(18);
    expect(strokes.slice(0, 13).every((s) => s === 1)).toBe(true);
    expect(strokes.slice(13).every((s) => s === 0)).toBe(true);
  });

  it('handles plus handicaps when allocating strokes', () => {
    const strokes = allocateStrokes(-3, baseTee.strokeIndex!);
    expect(strokes.filter((s) => s === -1)).toHaveLength(3);
    expect(strokes.filter((s) => s === 0)).toHaveLength(15);
  });

  it('computes net strokes with a minimum of 1', () => {
    expect(netStrokes(5, 2)).toBe(3);
    expect(netStrokes(3, 5)).toBe(1);
    expect(netStrokes(4, 0)).toBe(4);
  });

  it('computes stableford points', () => {
    expect(stablefordPoints(4, 4, 0)).toBe(2);
    expect(stablefordPoints(3, 4, 0)).toBe(3);
    expect(stablefordPoints(5, 4, 1)).toBe(2);
    expect(stablefordPoints(8, 4, 0)).toBe(0);
  });
});
