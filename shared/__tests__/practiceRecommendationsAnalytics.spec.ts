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
      origin: undefined,
      strokesGainedLightFocusCategory: undefined,
      weeklyGoalId: undefined,
      weekId: undefined,
      algorithmVersion: undefined,
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
      origin: undefined,
      strokesGainedLightFocusCategory: undefined,
      weeklyGoalId: null,
      weekId: null,
      algorithmVersion: undefined,
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
      experiment: {
        experimentKey: 'practice_recommendations',
        experimentBucket: 12,
        experimentVariant: 'treatment',
      },
    });

    const expected: PracticeMissionRecommendationClickedEvent = {
      missionId: 'mission-789',
      reason: 'fallback',
      rank: 3,
      surface: 'web_practice_missions',
      entryPoint: 'mission_row',
      focusArea: undefined,
      focusAreas: undefined,
      origin: undefined,
      strokesGainedLightFocusCategory: undefined,
      weeklyGoalId: undefined,
      weekId: undefined,
      algorithmVersion: undefined,
      experiment: {
        experimentKey: 'practice_recommendations',
        experimentBucket: 12,
        experimentVariant: 'treatment',
      },
    };

    expect(payload).toEqual(expected);
  });

  it('builds events for home recommendation surfaces', () => {
    const shown = buildPracticeMissionRecommendationShownEvent({
      missionId: 'mission-home',
      reason: 'focus_area',
      rank: 1,
      surface: 'mobile_home_practice',
      focusArea: 'Putting',
      algorithmVersion: 'v2',
      experiment: {
        experimentKey: 'practice_recommendations',
        experimentBucket: 7,
        experimentVariant: 'control',
      },
    });

    const clicked = buildPracticeMissionRecommendationClickedEvent({
      missionId: 'mission-home',
      reason: 'focus_area',
      rank: 1,
      surface: 'web_home_practice',
      entryPoint: 'home_card',
      focusArea: 'Putting',
      algorithmVersion: 'v1',
      experiment: {
        experimentKey: 'practice_recommendations',
        experimentBucket: 9,
        experimentVariant: 'disabled',
      },
    });

    expect(shown.surface).toBe('mobile_home_practice');
    expect(clicked.surface).toBe('web_home_practice');
    expect(shown.experiment?.experimentVariant).toBe('control');
    expect(clicked.experiment?.experimentVariant).toBe('disabled');
  });

  it('normalizes SG Light stats surfaces', () => {
    const shown = buildPracticeMissionRecommendationShownEvent({
      missionId: 'sg-light',
      reason: 'focus_area',
      rank: 1,
      surface: 'web_stats_sg_light_trend',
      focusArea: 'approach',
      origin: 'stats_card',
      strokesGainedLightFocusCategory: 'approach',
    });

    expect(shown.surface).toBe('web_stats_sg_light_trend');
    expect(shown.strokesGainedLightFocusCategory).toBe('approach');
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
      origin: undefined,
      strokesGainedLightFocusCategory: undefined,
      weeklyGoalId: undefined,
      weekId: undefined,
      algorithmVersion: undefined,
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
      origin: undefined,
      strokesGainedLightFocusCategory: undefined,
      weeklyGoalId: undefined,
      weekId: undefined,
      algorithmVersion: undefined,
      experiment: undefined,
    });
  });

  it('sanitizes experiment metadata and algorithm version', () => {
    const payload = buildPracticeMissionRecommendationShownEvent({
      missionId: 'mission-123',
      reason: 'fallback',
      rank: 1,
      surface: 'mobile_practice_missions',
      algorithmVersion: ' v1 ',
      experiment: {
        experimentKey: 'practice_recommendations',
        experimentBucket: 101.9,
        experimentVariant: 'disabled' as any,
      },
    });

    expect(payload).toEqual({
      missionId: 'mission-123',
      reason: 'fallback',
      rank: 1,
      surface: 'mobile_practice_missions',
      focusArea: undefined,
      focusAreas: undefined,
      origin: undefined,
      strokesGainedLightFocusCategory: undefined,
      weeklyGoalId: undefined,
      weekId: undefined,
      algorithmVersion: 'v1',
      experiment: {
        experimentKey: 'practice_recommendations',
        experimentBucket: 101,
        experimentVariant: 'disabled',
      },
    });
  });

  it('includes SG Light and origin metadata when provided', () => {
    const payload = buildPracticeMissionRecommendationShownEvent({
      missionId: 'mission-sg',
      reason: 'focus_area',
      rank: 1,
      surface: 'mobile_practice_missions',
      focusArea: 'Driving',
      origin: 'round_recap_sg_light',
      strokesGainedLightFocusCategory: 'tee',
    });

    expect(payload.origin).toBe('round_recap_sg_light');
    expect(payload.strokesGainedLightFocusCategory).toBe('tee');
  });
});
