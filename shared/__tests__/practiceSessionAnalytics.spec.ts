import { describe, expect, it } from 'vitest';

import {
  buildPracticeMissionCompleteEvent,
  buildPracticeMissionStartEvent,
} from '@shared/practice/practiceSessionAnalytics';

describe('practice session analytics', () => {
  it('builds start events without recommendation context', () => {
    const event = buildPracticeMissionStartEvent({
      missionId: 'mission-123',
      sourceSurface: 'missions_list',
    });

    expect(event).toEqual({
      missionId: 'mission-123',
      sourceSurface: 'missions_list',
    });
  });

  it('attaches sanitized recommendation context to start events', () => {
    const event = buildPracticeMissionStartEvent({
      missionId: 'mission-123',
      sourceSurface: 'missions_list',
      recommendation: {
        source: 'practice_recommendations',
        rank: 2,
        focusArea: 'driver',
        reasonKey: 'focus_area',
        algorithmVersion: 'v1',
        experiment: {
          experimentKey: 'practice_recommendations',
          experimentBucket: 7,
          experimentVariant: 'enabled',
        },
      },
    });

    expect(event.recommendation).toEqual({
      source: 'practice_recommendations',
      rank: 2,
      focusArea: 'driver',
      reasonKey: 'focus_area',
      algorithmVersion: 'v1',
      experiment: {
        experimentKey: 'practice_recommendations',
        experimentBucket: 7,
        experimentVariant: 'enabled',
      },
    });
  });

  it('builds completion events with recommendation context', () => {
    const event = buildPracticeMissionCompleteEvent({
      missionId: 'mission-123',
      samplesCount: 14,
      recommendation: {
        source: 'practice_recommendations',
        rank: 1.4,
        focusArea: 'irons',
        reasonKey: 'goal_progress',
        algorithmVersion: 'v2',
        experiment: {
          experimentKey: 'practice_recommendations',
          experimentBucket: 3,
          experimentVariant: 'enabled',
        },
      },
    });

    expect(event).toEqual({
      missionId: 'mission-123',
      samplesCount: 14,
      recommendation: {
        source: 'practice_recommendations',
        rank: 1,
        focusArea: 'irons',
        reasonKey: 'goal_progress',
        algorithmVersion: 'v2',
        experiment: {
          experimentKey: 'practice_recommendations',
          experimentBucket: 3,
          experimentVariant: 'enabled',
        },
      },
    });
  });
});
