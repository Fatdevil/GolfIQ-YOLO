import { describe, expect, it } from 'vitest';

import type { PlayerBag } from '@app/api/bagClient';
import { MIN_AUTOCALIBRATED_SAMPLES, type BagClubStatsMap } from '@shared/caddie/bagStats';
import {
  LARGE_GAP_MIN,
  OVERLAP_MAX,
  analyzeBagGaps,
  computeClubDataStatusMap,
} from '@app/caddie/bagGapInsights';

const baseBag: PlayerBag = {
  clubs: [
    { clubId: '9i', label: '9i', avgCarryM: 120, sampleCount: 0, active: true },
    { clubId: '8i', label: '8i', avgCarryM: 130, sampleCount: 0, active: true },
    { clubId: '7i', label: '7i', avgCarryM: 140, sampleCount: 0, active: true },
    { clubId: '6i', label: '6i', avgCarryM: 150, sampleCount: 0, active: true },
  ],
};

describe('bagGapInsights', () => {
  it('detects large gaps and overlaps only among calibrated clubs', () => {
    const stats: BagClubStatsMap = {
      '9i': { clubId: '9i', meanDistanceM: 118, sampleCount: MIN_AUTOCALIBRATED_SAMPLES },
      '8i': { clubId: '8i', meanDistanceM: 123, sampleCount: MIN_AUTOCALIBRATED_SAMPLES },
      '7i': { clubId: '7i', meanDistanceM: 160, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 2 },
      '6i': { clubId: '6i', meanDistanceM: 165, sampleCount: MIN_AUTOCALIBRATED_SAMPLES + 1 },
    };

    const { insights } = analyzeBagGaps(baseBag, stats);

    expect(insights).toEqual([
      {
        type: 'overlap',
        lowerClubId: '9i',
        upperClubId: '8i',
        gapDistance: 5,
      },
      {
        type: 'large_gap',
        lowerClubId: '8i',
        upperClubId: '7i',
        gapDistance: 37,
      },
      {
        type: 'overlap',
        lowerClubId: '7i',
        upperClubId: '6i',
        gapDistance: 5,
      },
    ]);

    expect(insights[1]!.gapDistance).toBeGreaterThanOrEqual(LARGE_GAP_MIN);
    expect(insights[0]!.gapDistance).toBeLessThanOrEqual(OVERLAP_MAX);
  });

  it('ignores clubs without enough samples when computing insights', () => {
    const stats: BagClubStatsMap = {
      '9i': { clubId: '9i', meanDistanceM: 115, sampleCount: MIN_AUTOCALIBRATED_SAMPLES - 1 },
      '8i': { clubId: '8i', meanDistanceM: 125, sampleCount: MIN_AUTOCALIBRATED_SAMPLES },
      '7i': { clubId: '7i', meanDistanceM: 135, sampleCount: 0 },
    };

    const { insights } = analyzeBagGaps(baseBag, stats);

    expect(insights).toHaveLength(0);
  });

  it('classifies club data status based on sample thresholds', () => {
    const stats: BagClubStatsMap = {
      '9i': { clubId: '9i', meanDistanceM: 115, sampleCount: MIN_AUTOCALIBRATED_SAMPLES },
      '8i': { clubId: '8i', meanDistanceM: 123, sampleCount: MIN_AUTOCALIBRATED_SAMPLES - 2 },
      '7i': { clubId: '7i', meanDistanceM: 160, sampleCount: 0 },
    };

    const statusMap = computeClubDataStatusMap(baseBag, stats);

    expect(statusMap).toEqual({
      '6i': 'no_data',
      '7i': 'no_data',
      '8i': 'needs_more_samples',
      '9i': 'auto_calibrated',
    });
  });
});
