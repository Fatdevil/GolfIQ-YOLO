import { describe, expect, it } from 'vitest';

import { computeAutoHoleSuggestion, distanceMeters, type CourseLayout } from '../autoHoleCore';

const demoCourse: CourseLayout = {
  id: 'demo',
  name: 'Demo Course',
  holes: [
    { number: 1, tee: { lat: 59.3, lon: 18.1 }, green: { lat: 59.301, lon: 18.101 } },
    { number: 2, tee: { lat: 59.305, lon: 18.102 }, green: { lat: 59.306, lon: 18.103 } },
  ],
};

describe('computeAutoHoleSuggestion', () => {
  it('returns null suggestion when course or position is missing', () => {
    expect(computeAutoHoleSuggestion(null, null)).toEqual({
      suggestedHole: null,
      distanceToSuggestedM: null,
      confidence: 'low',
    });

    expect(
      computeAutoHoleSuggestion(demoCourse, null),
    ).toEqual({ suggestedHole: null, distanceToSuggestedM: null, confidence: 'low' });
  });

  it('suggests the nearest hole with confidence tiers', () => {
    const nearFirstHole = computeAutoHoleSuggestion(demoCourse, demoCourse.holes[0].tee);
    expect(nearFirstHole.suggestedHole).toBe(1);
    expect(nearFirstHole.confidence).toBe('high');

    const mediumDistance = distanceMeters(demoCourse.holes[0].tee, {
      lat: demoCourse.holes[0].tee.lat + 0.0005,
      lon: demoCourse.holes[0].tee.lon,
    });
    expect(mediumDistance).toBeGreaterThan(40);
    expect(mediumDistance).toBeLessThan(80);

    const mediumSuggestion = computeAutoHoleSuggestion(demoCourse, {
      lat: demoCourse.holes[0].tee.lat + 0.0005,
      lon: demoCourse.holes[0].tee.lon,
    });
    expect(mediumSuggestion.suggestedHole).toBe(1);
    expect(mediumSuggestion.confidence).toBe('medium');
  });

  it('returns low confidence when far from all holes', () => {
    const far = computeAutoHoleSuggestion(demoCourse, { lat: 0, lon: 0 });
    expect(far.suggestedHole).toBeNull();
    expect(far.confidence).toBe('low');
  });
});
