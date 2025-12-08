import { describe, expect, it } from 'vitest';

import type { BagReadinessOverview } from '../bagReadiness';
import { buildBagPracticeRecommendation } from '../bagPracticeRecommendations';
import type { BagSuggestion } from '../bagTuningSuggestions';

describe('buildBagPracticeRecommendation', () => {
  const baseOverview: BagReadinessOverview = {
    readiness: {
      score: 55,
      grade: 'okay',
      totalClubs: 2,
      calibratedClubs: 0,
      needsMoreSamplesCount: 0,
      noDataCount: 0,
      largeGapCount: 0,
      overlapCount: 0,
    },
    suggestions: [],
    dataStatusByClubId: {},
  };

  it('returns recommendation for large gap suggestions', () => {
    const suggestions: BagSuggestion[] = [
      {
        id: 'fill_gap:8i:9i',
        type: 'fill_gap',
        severity: 'high',
        lowerClubId: '8i',
        upperClubId: '9i',
        gapDistance: 25,
      },
    ];

    const rec = buildBagPracticeRecommendation(baseOverview, suggestions);

    expect(rec).toEqual({
      id: 'practice_fill_gap:8i:9i',
      titleKey: 'bag.practice.fill_gap.title',
      descriptionKey: 'bag.practice.fill_gap.description',
      targetClubs: ['8i', '9i'],
      targetSampleCount: 16,
      sourceSuggestionId: 'fill_gap:8i:9i',
    });
  });

  it('returns recommendation for calibrate suggestions with low samples', () => {
    const suggestions: BagSuggestion[] = [
      {
        id: 'calibrate:pw',
        type: 'calibrate',
        severity: 'medium',
        clubId: 'pw',
      },
    ];

    const rec = buildBagPracticeRecommendation(baseOverview, suggestions);

    expect(rec).toEqual({
      id: 'practice_calibrate:pw',
      titleKey: 'bag.practice.calibrate.title',
      descriptionKey: 'bag.practice.calibrate.more_samples.description',
      targetClubs: ['pw'],
      targetSampleCount: 10,
      sourceSuggestionId: 'calibrate:pw',
    });
  });

  it('returns null when readiness is excellent', () => {
    const overview: BagReadinessOverview = {
      ...baseOverview,
      readiness: { ...baseOverview.readiness, grade: 'excellent', score: 96 },
    };

    const rec = buildBagPracticeRecommendation(overview, [
      {
        id: 'fill_gap:7i:8i',
        type: 'fill_gap',
        severity: 'low',
        lowerClubId: '7i',
        upperClubId: '8i',
        gapDistance: 18,
      },
    ]);

    expect(rec).toBeNull();
  });
});
