import { describe, expect, it } from 'vitest';

import type { PlayerBag } from '@shared/caddie/playerBag';
import { MIN_AUTOCALIBRATED_SAMPLES, type BagClubStatsMap } from '@shared/caddie/bagStats';
import { buildBagReadinessOverview, computeBagReadiness } from '@shared/caddie/bagReadiness';

const baseBag: PlayerBag = {
  clubs: [
    { clubId: '9i', label: '9i', avgCarryM: 120, sampleCount: 0, active: true },
    { clubId: '7i', label: '7i', avgCarryM: 140, sampleCount: 0, active: true },
    { clubId: '5i', label: '5i', avgCarryM: 160, sampleCount: 0, active: true },
  ],
};

describe('computeBagReadiness', () => {
  it('rewards fully calibrated, well spaced bags', () => {
    const stats: BagClubStatsMap = {
      '9i': { clubId: '9i', meanDistanceM: 120, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 1 },
      '7i': { clubId: '7i', meanDistanceM: 140, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 2 },
      '5i': { clubId: '5i', meanDistanceM: 165, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 3 },
    };

    const readiness = computeBagReadiness(baseBag, stats);

    expect(readiness.score).toBeGreaterThanOrEqual(95);
    expect(readiness.grade).toBe('excellent');
    expect(readiness.calibratedClubs).toBe(3);
    expect(readiness.largeGapCount).toBe(0);
    expect(readiness.overlapCount).toBe(0);
  });

  it('accounts for missing data, low samples, and gaps', () => {
    const bag: PlayerBag = {
      clubs: [
        ...baseBag.clubs,
        { clubId: '3w', label: '3w', avgCarryM: 200, sampleCount: 0, active: true },
      ],
    };

    const stats: BagClubStatsMap = {
      '9i': { clubId: '9i', meanDistanceM: 118, sampleCount: MIN_AUTOCALIBRATED_SAMPLES - 1 },
      '7i': { clubId: '7i', meanDistanceM: 148, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 1 },
      '3w': { clubId: '3w', meanDistanceM: 220, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 2 },
      // 5i intentionally missing to simulate no data
    };

    const readiness = computeBagReadiness(bag, stats);

    expect(readiness.noDataCount).toBe(1);
    expect(readiness.needsMoreSamplesCount).toBe(1);
    expect(readiness.largeGapCount).toBe(1);
    expect(readiness.grade === 'good' || readiness.grade === 'okay').toBe(true);
    expect(readiness.score).toBeLessThan(90);
  });

  it('clamps very poor bags to the bottom range', () => {
    const emptyStats: BagClubStatsMap = {};

    const readiness = computeBagReadiness(
      {
        clubs: [
          ...baseBag.clubs,
          { clubId: '3w', label: '3w', avgCarryM: 195, sampleCount: 0, active: true },
        ],
      },
      emptyStats,
    );

    expect(readiness.score).toBeGreaterThanOrEqual(0);
    expect(readiness.score).toBeLessThanOrEqual(40);
    expect(readiness.grade).toBe('poor');
    expect(readiness.noDataCount).toBe(readiness.totalClubs);
  });

  it('builds an overview with readiness and prioritized suggestions', () => {
    const stats: BagClubStatsMap = {
      '9i': { clubId: '9i', meanDistanceM: 118, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 2 },
      '7i': { clubId: '7i', meanDistanceM: 140, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 2 },
    };

    const overview = buildBagReadinessOverview(baseBag, stats);

    expect(overview.readiness.score).toBeGreaterThan(85);
    expect(overview.readiness.grade).toBe('excellent');
    expect(overview.suggestions.length).toBeGreaterThan(0);
  });

  it('returns an overview without suggestions when the bag is in great shape', () => {
    const stats: BagClubStatsMap = {
      '9i': { clubId: '9i', meanDistanceM: 120, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 5 },
      '7i': { clubId: '7i', meanDistanceM: 140, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 5 },
      '5i': { clubId: '5i', meanDistanceM: 160, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 5 },
    };

    const overview = buildBagReadinessOverview(baseBag, stats);

    expect(overview.readiness.score).toBeGreaterThanOrEqual(95);
    expect(overview.suggestions.length).toBe(0);
  });
});
