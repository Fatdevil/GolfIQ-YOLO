import { describe, expect, it } from 'vitest';

import {
  getExperimentBucket,
  getExperimentVariant,
  getPracticeRecommendationsExperiment,
  isInExperiment,
} from '../experiments/flags';

describe('experiments/flags', () => {
  it('returns a stable bucket for the same user', () => {
    const first = getExperimentBucket('weekly_goal_nudge', 'user-123');
    const second = getExperimentBucket('weekly_goal_nudge', 'user-123');

    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(100);
    expect(second).toBe(first);
  });

  it('assigns different buckets for different users', () => {
    const bucketA = getExperimentBucket('weekly_goal_nudge', 'user-a');
    const bucketB = getExperimentBucket('weekly_goal_nudge', 'user-b');

    expect(bucketA).not.toBe(bucketB);
  });

  it('uses rollout threshold to derive treatment assignment', () => {
    const userId = 'user-rollout-check';
    const bucket = getExperimentBucket('weekly_goal_nudge', userId);
    const variant = getExperimentVariant('weekly_goal_nudge', userId);

    expect(variant === 'treatment').toBe(bucket < 50);
    expect(isInExperiment('weekly_goal_nudge', userId)).toBe(variant === 'treatment');
  });

  it('enables practice recommendations by default', () => {
    const experiment = getPracticeRecommendationsExperiment('user-practice');

    expect(experiment.experimentKey).toBe('practice_recommendations');
    expect(experiment.experimentBucket).toBeGreaterThanOrEqual(0);
    expect(experiment.experimentBucket).toBeLessThan(100);
    expect(experiment.experimentVariant === 'treatment' || experiment.experimentVariant === 'control').toBe(true);
    const expectedVariant = experiment.experimentBucket < 50 ? 'treatment' : 'control';
    expect(experiment.experimentVariant).toBe(expectedVariant);
    expect(experiment.enabled).toBe(true);
  });

  it('maps control buckets to a control variant while keeping recommendations enabled', () => {
    const candidates = Array.from({ length: 200 }, (_, index) => `control-user-${index}`);
    const experiment = candidates
      .map((user) => getPracticeRecommendationsExperiment(user))
      .find((candidate) => candidate.experimentVariant === 'control');

    expect(experiment?.experimentVariant).toBe('control');
    expect(experiment?.enabled).toBe(true);
  });
});
