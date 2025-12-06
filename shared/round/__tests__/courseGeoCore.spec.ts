import { describe, expect, it } from 'vitest';

import { computeNearestCourse, type CourseSummaryGeo, type LatLon } from '../autoHoleCore';

const playerNear: LatLon = { lat: 59.3, lon: 18.1 };
const farAway: LatLon = { lat: 0, lon: 0 };

const courses: CourseSummaryGeo[] = [
  { id: 'near', name: 'Near Course', location: { lat: 59.3001, lon: 18.1001 } },
  { id: 'far', name: 'Far Course', location: { lat: 40.7128, lon: -74.006 } },
];

describe('computeNearestCourse', () => {
  it('returns null suggestion when missing inputs', () => {
    expect(computeNearestCourse([], playerNear)).toEqual({
      suggestedCourseId: null,
      distanceToSuggestedM: null,
      confidence: 'low',
    });

    expect(computeNearestCourse(courses, null)).toEqual({
      suggestedCourseId: null,
      distanceToSuggestedM: null,
      confidence: 'low',
    });
  });

  it('suggests the nearest available course', () => {
    const suggestion = computeNearestCourse(courses, playerNear);
    expect(suggestion.suggestedCourseId).toBe('near');
    expect(suggestion.confidence === 'high' || suggestion.confidence === 'medium').toBe(true);
  });

  it('falls back to no suggestion when too far from all courses', () => {
    const suggestion = computeNearestCourse(courses, farAway);
    expect(suggestion.suggestedCourseId).toBeNull();
    expect(suggestion.confidence).toBe('low');
  });
});
