import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildQuickStartPlan } from '../quickStartRound';
import type { CourseSummary } from '@app/api/courseClient';
import * as autoHoleCore from '@shared/round/autoHoleCore';
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
      par: 4,
      tee: { lat: 59.3 + index * 0.001, lon: 18.1 },
      green: { lat: 59.3005 + index * 0.001, lon: 18.1005 },
    })),
  };

  const nineHoleLayout: CourseLayout = {
    id: 'near',
    name: 'Near Course 9',
    holes: Array.from({ length: 9 }, (_, index) => ({
      number: index + 1,
      par: 4,
      tee: { lat: 59.3 + index * 0.001, lon: 18.1 },
      green: { lat: 59.3005 + index * 0.001, lon: 18.1005 },
    })),
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a plan for the nearest course and suggested hole starting at 1', () => {
    const plan = buildQuickStartPlan({
      courses,
      playerPosition: { lat: 59.3, lon: 18.1 },
      courseLayoutsById: { [layout.id]: layout },
    });

    expect(plan).toEqual({
      courseId: 'near',
      startHole: 1,
      holeCount: 18,
    });
  });

  it('clamps hole count to remaining holes when starting mid-course', () => {
    const plan = buildQuickStartPlan({
      courses,
      playerPosition: { lat: 59.302, lon: 18.1 },
      courseLayoutsById: { [layout.id]: layout },
    });

    expect(plan).toEqual({
      courseId: 'near',
      startHole: 3,
      holeCount: 16,
    });
  });

  it('clamps hole count to remaining holes on shorter layouts', () => {
    const plan = buildQuickStartPlan({
      courses,
      playerPosition: { lat: 59.304, lon: 18.1 },
      courseLayoutsById: { [nineHoleLayout.id]: nineHoleLayout },
    });

    expect(plan).toEqual({
      courseId: 'near',
      startHole: 5,
      holeCount: 5,
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

  it('returns null when suggested start hole exceeds course length', () => {
    vi.spyOn(autoHoleCore, 'computeAutoHoleSuggestion').mockReturnValue({
      suggestedHole: 20,
      distanceToSuggestedM: 10,
      confidence: 'high',
    });

    const plan = buildQuickStartPlan({
      courses,
      playerPosition: { lat: 59.3, lon: 18.1 },
      courseLayoutsById: { [layout.id]: layout },
    });

    expect(plan).toBeNull();
  });
});
