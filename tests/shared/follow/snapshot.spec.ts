import { describe, expect, it } from 'vitest';

import { buildSnapshot } from '../../../shared/follow/snapshot';
import type { HoleRef } from '../../../shared/follow/types';

describe('follow snapshot', () => {
  const hole: HoleRef = {
    id: 'h1',
    number: 1,
    front: { lat: 37.0, lon: -122.0 },
    middle: { lat: 37.0005, lon: -122.0005 },
    back: { lat: 37.001, lon: -122.001 },
  };

  it('builds snapshot shape', () => {
    const snapshot = buildSnapshot({
      hole,
      distances: { front: 120, middle: 135, back: 150 },
      headingDeg: 45,
      playsLikePct: 12,
      tournamentSafe: false,
      ts: 1234,
    });
    expect(snapshot).toEqual({
      ts: 1234,
      holeNo: 1,
      fmb: { front: 120, middle: 135, back: 150 },
      headingDeg: 45,
      playsLikePct: 12,
      tournamentSafe: false,
    });
  });

  it('strips plays-like when tournament-safe', () => {
    const snapshot = buildSnapshot({
      hole,
      distances: { front: 100, middle: 110, back: 125 },
      headingDeg: 90,
      playsLikePct: 8,
      tournamentSafe: true,
      ts: 4567,
    });
    expect(snapshot.playsLikePct).toBeUndefined();
    expect(snapshot.tournamentSafe).toBe(true);
  });
});
