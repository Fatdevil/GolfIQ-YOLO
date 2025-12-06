import { describe, expect, it } from 'vitest';

import { buildQuickStartPlan } from '../quickStartRound';
import type { CourseSummary } from '@app/api/courseClient';
import type { CourseLayout } from '@shared/round/autoHoleCore';

describe('buildQuickStartPlan', () => {
  const courses: CourseSummary[] = [
    { id: 'near', name: 'Near Course', holeCount: 18, location: { lat: 59.3, lon: 18.1 } },
    { id: 'far', name: 'Far Course', holeCount: 18, location: { lat: 0, lon: 0 } },
  ];

  const layout: CourseLayout = {
    id: 'near',
    name: 'Near Course',
    holes: Array.from({ length: 18 }, (_, index) => ({
      number: index + 1,
      tee: { lat: 59.3 + index * 0.001, lon: 18.1 },
      green: { lat: 59.3005 + index * 0.001, lon: 18.1005 },
    })),
  };

  it('builds a plan for the nearest course and suggested hole', () => {
    const plan = buildQuickStartPlan({
      courses,
      playerPosition: { lat: 59.302, lon: 18.1 },
      courseLayoutsById: { [layout.id]: layout },
    });

    expect(plan).toEqual({
      courseId: 'near',
      startHole: 3,
      holeCount: 18,
    });
  });

  it('returns null when no location is available', () => {
    const plan = buildQuickStartPlan({
      courses,
      playerPosition: null,
      courseLayoutsById: { [layout.id]: layout },
    });

    expect(plan).toBeNull();
  });

  it('returns null when layout is missing', () => {
    const plan = buildQuickStartPlan({
      courses,
      playerPosition: { lat: 59.3, lon: 18.1 },
      courseLayoutsById: {},
    });

    expect(plan).toBeNull();
  });
});
