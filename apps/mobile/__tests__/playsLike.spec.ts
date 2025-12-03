import { describe, expect, it } from 'vitest';

import {
  computeEffectiveDistance,
  getPlaysLikeRecommendation,
  recommendClub,
  type PlayerProfile,
} from '@app/caddie/playsLike';

const profile: PlayerProfile = {
  carries: {
    '9i': 120,
    '8i': 135,
    '7i': 150,
    '6i': 165,
  },
  priority: ['8i', '7i', '6i', '9i'],
};

describe('computeEffectiveDistance', () => {
  it('applies 1:1 slope adjustment for uphill', () => {
    const result = computeEffectiveDistance(150, 10, 0, 0);
    expect(result.effectiveDistance).toBeCloseTo(160);
    expect(result.breakdown.slopeAdjust).toBeCloseTo(10);
    expect(result.breakdown.windAdjust).toBeCloseTo(0);
  });

  it('handles missing wind data gracefully', () => {
    const result = computeEffectiveDistance(140, -5, Number.NaN, 0);
    expect(result.breakdown.windAdjust).toBe(0);
    expect(result.effectiveDistance).toBeCloseTo(135);
  });
});

describe('recommendClub', () => {
  it('returns smallest club covering distance', () => {
    const club = recommendClub(148, profile);
    expect(club).toBe('7i');
  });

  it('falls back to longest carry when short of gap', () => {
    const club = recommendClub(190, profile);
    expect(club).toBe('6i');
  });
});

describe('getPlaysLikeRecommendation', () => {
  it('computes uphill calm scenario', () => {
    const result = getPlaysLikeRecommendation({
      distance: 150,
      elevationDiff: 10,
      windSpeed: 0,
      windAngle: 0,
      playerProfile: profile,
    });

    expect(result.effectiveDistance).toBeCloseTo(160);
    expect(result.breakdown.slopeAdjust).toBeCloseTo(10);
    expect(result.recommendedClub).toBe('6i');
  });

  it('applies tailwind reduction', () => {
    const result = getPlaysLikeRecommendation({
      distance: 120,
      elevationDiff: 0,
      windSpeed: 8,
      windAngle: 180,
      playerProfile: profile,
    });

    expect(result.breakdown.windAdjust).toBeLessThan(0);
    expect(result.effectiveDistance).toBeLessThan(120);
    expect(result.recommendedClub).toBe('9i');
  });
});
