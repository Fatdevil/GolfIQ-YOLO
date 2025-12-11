import { describe, expect, it } from 'vitest';

import { getExperimentBucket, getExperimentVariant, isInExperiment } from '../experiments/flags';

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
});
