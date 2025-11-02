import { describe, expect, it } from 'vitest';

import { computeOverlay } from '../aim';
import { BagStats, ClubStats } from '../../bag/types';
import { XY } from '../geom';

const tee: XY = { x: 0, y: 0 };
const target: XY = { x: 220, y: 30 };
const canvas = { w: 600, h: 400 };

const clubStats = (overrides: Partial<ClubStats>): ClubStats => ({
  club: overrides.club ?? 'D',
  samples: overrides.samples ?? 100,
  meanCarry_m: overrides.meanCarry_m ?? overrides.p50_m ?? 0,
  p25_m: overrides.p25_m ?? overrides.p50_m ?? 0,
  p50_m: overrides.p50_m ?? 0,
  p75_m: overrides.p75_m ?? overrides.p50_m ?? 0,
  std_m: overrides.std_m ?? null,
  sgPerShot: overrides.sgPerShot ?? null,
});

const baseBag = (clubs: ClubStats[]): BagStats => ({
  updatedAt: 0,
  clubs: clubs.reduce<Record<string, ClubStats>>((acc, stat) => {
    acc[stat.club] = stat;
    return acc;
  }, {}),
});

const corridorHalfWidthPx = (corridor: XY[]): number => {
  const startWidth = Math.hypot(
    corridor[0].x - corridor[1].x,
    corridor[0].y - corridor[1].y
  );
  return startWidth / 2;
};

const ringRadiusPx = (ring: XY[], corridor: XY[]): number => {
  const center = {
    x: (corridor[2].x + corridor[3].x) / 2,
    y: (corridor[2].y + corridor[3].y) / 2,
  };
  const first = ring[0];
  return Math.hypot(first.x - center.x, first.y - center.y);
};

const segmentScale = (corridor: XY[]): number => {
  const startCenter = {
    x: (corridor[0].x + corridor[1].x) / 2,
    y: (corridor[0].y + corridor[1].y) / 2,
  };
  const endCenter = {
    x: (corridor[2].x + corridor[3].x) / 2,
    y: (corridor[2].y + corridor[3].y) / 2,
  };
  const screenLength = Math.hypot(endCenter.x - startCenter.x, endCenter.y - startCenter.y);
  const worldLength = Math.hypot(target.x - tee.x, target.y - tee.y);
  return screenLength / worldLength;
};

describe('computeOverlay', () => {
  it('picks the longest viable non-putter when no club is provided', () => {
    const bag = baseBag([
      clubStats({ club: '7i', p50_m: 150, std_m: 8 }),
      clubStats({ club: 'D', p50_m: 250, std_m: 12 }),
      clubStats({ club: '5W', p50_m: 220, std_m: 10 }),
      clubStats({ club: 'Putter', p50_m: 3 }),
    ]);

    const overlay = computeOverlay({ tee, target, canvas, bag });

    expect(overlay.meta.club).toBe('D');
    expect(overlay.meta.p50_m).toBeCloseTo(250);
  });

  it('scales corridor width with dispersion metrics', () => {
    const bagNarrow = baseBag([
      clubStats({ club: '3W', p50_m: 230, std_m: 5 }),
    ]);
    const bagWide = baseBag([
      clubStats({ club: '3W', p50_m: 230, std_m: 12 }),
    ]);

    const narrow = computeOverlay({ tee, target, canvas, bag: bagNarrow, club: '3W' });
    const wide = computeOverlay({ tee, target, canvas, bag: bagWide, club: '3W' });

    const scaleNarrow = segmentScale(narrow.corridor);
    const scaleWide = segmentScale(wide.corridor);

    const halfWidthNarrow_m = corridorHalfWidthPx(narrow.corridor) / scaleNarrow;
    const halfWidthWide_m = corridorHalfWidthPx(wide.corridor) / scaleWide;

    expect(halfWidthWide_m).toBeGreaterThan(halfWidthNarrow_m);
  });

  it('scales landing ring radius with p50 carry', () => {
    const bagShort = baseBag([
      clubStats({ club: '5i', p50_m: 160, std_m: 6 }),
    ]);
    const bagLong = baseBag([
      clubStats({ club: '5i', p50_m: 240, std_m: 6 }),
    ]);

    const shortOverlay = computeOverlay({ tee, target, canvas, bag: bagShort, club: '5i' });
    const longOverlay = computeOverlay({ tee, target, canvas, bag: bagLong, club: '5i' });

    const scaleShort = segmentScale(shortOverlay.corridor);
    const scaleLong = segmentScale(longOverlay.corridor);

    const radiusShort_m = ringRadiusPx(shortOverlay.ring, shortOverlay.corridor) / scaleShort;
    const radiusLong_m = ringRadiusPx(longOverlay.ring, longOverlay.corridor) / scaleLong;

    expect(radiusLong_m).toBeGreaterThan(radiusShort_m);
  });
});
