import { describe, expect, it } from 'vitest';

import { computePlaysLikeDistance, suggestClubForTarget } from '@app/caddie/caddieDistanceEngine';

describe('computePlaysLikeDistance', () => {
  it('adjusts distance for headwind and elevation', () => {
    const result = computePlaysLikeDistance({
      targetDistanceM: 150,
      windSpeedMps: 4,
      windDirectionDeg: 0,
      elevationDeltaM: 5,
    });

    expect(result).toBeCloseTo(157.7, 1);
  });

  it('reduces distance for tailwind and downhill', () => {
    const result = computePlaysLikeDistance({
      targetDistanceM: 150,
      windSpeedMps: 4,
      windDirectionDeg: 180,
      elevationDeltaM: -5,
    });

    expect(result).toBeLessThan(150);
  });
});

describe('suggestClubForTarget', () => {
  it('chooses the smallest club that covers plays-like distance', () => {
    const club = suggestClubForTarget(
      [
        { club: '8i', baselineCarryM: 145, samples: 5, source: 'auto' },
        { club: '7i', baselineCarryM: 158, samples: 4, source: 'auto' },
        { club: '6i', baselineCarryM: 170, samples: 2, source: 'auto' },
      ],
      { targetDistanceM: 150, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
    );

    expect(club?.club).toBe('7i');
  });

  it('falls back to best available club when samples are sparse', () => {
    const club = suggestClubForTarget(
      [
        { club: 'PW', baselineCarryM: 110, samples: 1, source: 'auto' },
        { club: '9i', baselineCarryM: 125, samples: 2, source: 'auto' },
      ],
      { targetDistanceM: 120, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
    );

    expect(club?.club).toBe('9i');
  });

  it('prefers manual carry when source is manual', () => {
    const club = suggestClubForTarget(
      [
        { club: '8i', baselineCarryM: 150, manualCarryM: 140, samples: 5, source: 'manual' },
        { club: '9i', baselineCarryM: 135, samples: 5, source: 'auto' },
      ],
      { targetDistanceM: 138, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
    );

    expect(club?.club).toBe('8i');
  });

  it('ignores manual carry when source is auto', () => {
    const club = suggestClubForTarget(
      [
        { club: '8i', baselineCarryM: 150, manualCarryM: 170, samples: 5, source: 'auto' },
        { club: '9i', baselineCarryM: 135, samples: 5, source: 'auto' },
      ],
      { targetDistanceM: 140, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
    );

    expect(club?.club).toBe('8i');
  });
});
