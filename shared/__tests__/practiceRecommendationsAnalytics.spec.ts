import { describe, expect, it, vi } from 'vitest';

import {
  buildPracticeMissionRecommendationClickedEvent,
  buildPracticeMissionRecommendationShownEvent,
  emitPracticeMissionRecommendationClicked,
  emitPracticeMissionRecommendationShown,
  type PracticeMissionRecommendationClickedEvent,
  type PracticeMissionRecommendationShownEvent,
} from '../practice/practiceRecommendationsAnalytics';

describe('practiceRecommendationsAnalytics', () => {
  it('builds a focus-area impression payload', () => {
    const payload = buildPracticeMissionRecommendationShownEvent({
      missionId: 'mission-123',
      reason: 'focus_area',
      rank: 1,
      surface: 'mobile_practice_missions',
      focusArea: 'Driving',
    });

    const expected: PracticeMissionRecommendationShownEvent = {
      missionId: 'mission-123',
      reason: 'focus_area',
      rank: 1,
      surface: 'mobile_practice_missions',
      focusArea: 'Driving',
      focusAreas: undefined,
      weeklyGoalId: undefined,
      weekId: undefined,
      experiment: undefined,
    };

    expect(payload).toEqual(expected);
  });

  it('builds a goal-progress impression payload and sanitizes strings', () => {
    const payload = buildPracticeMissionRecommendationShownEvent({
      missionId: 'mission-456',
      reason: 'goal_progress',
      rank: 2.4,
      surface: 'web_practice_missions',
      focusArea: '  Approach  ',
      focusAreas: ['approach', '  putting '],
      weeklyGoalId: '',
      weekId: '  ',
    });

    expect(payload).toEqual({
      missionId: 'mission-456',
      reason: 'goal_progress',
      rank: 2,
      surface: 'web_practice_missions',
      focusArea: 'Approach',
      focusAreas: ['approach', 'putting'],
      weeklyGoalId: null,
      weekId: null,
      experiment: undefined,
    });
  });

  it('builds a fallback click payload with experiment metadata', () => {
    const payload = buildPracticeMissionRecommendationClickedEvent({
      missionId: 'mission-789',
      reason: 'fallback',
      rank: 3,
      surface: 'web_practice_missions',
      entryPoint: 'mission_row',
      experiment: { experimentKey: 'rec_experiment', experimentBucket: 12, experimentVariant: 'treatment' },
    });

    const expected: PracticeMissionRecommendationClickedEvent = {
      missionId: 'mission-789',
      reason: 'fallback',
      rank: 3,
      surface: 'web_practice_missions',
      entryPoint: 'mission_row',
      focusArea: undefined,
      focusAreas: undefined,
      weeklyGoalId: undefined,
      weekId: undefined,
      experiment: { experimentKey: 'rec_experiment', experimentBucket: 12, experimentVariant: 'treatment' },
    };

    expect(payload).toEqual(expected);
  });

  it('emits the correct events', () => {
    const emit = vi.fn();
    const client = { emit };

    emitPracticeMissionRecommendationShown(client, {
      missionId: 'mission-1',
      reason: 'focus_area',
      rank: 1,
      surface: 'mobile_practice_missions',
    });

    emitPracticeMissionRecommendationClicked(client, {
      missionId: 'mission-2',
      reason: 'goal_progress',
      rank: 2,
      surface: 'web_practice_missions',
      entryPoint: 'mission_row',
    });

    expect(emit).toHaveBeenCalledWith('practice_mission_recommendation_shown', {
      missionId: 'mission-1',
      reason: 'focus_area',
      rank: 1,
      surface: 'mobile_practice_missions',
      focusArea: undefined,
      focusAreas: undefined,
      weeklyGoalId: undefined,
      weekId: undefined,
      experiment: undefined,
    });

    expect(emit).toHaveBeenCalledWith('practice_mission_recommendation_clicked', {
      missionId: 'mission-2',
      reason: 'goal_progress',
      rank: 2,
      surface: 'web_practice_missions',
      entryPoint: 'mission_row',
      focusArea: undefined,
      focusAreas: undefined,
      weeklyGoalId: undefined,
      weekId: undefined,
      experiment: undefined,
    });
  });
});
