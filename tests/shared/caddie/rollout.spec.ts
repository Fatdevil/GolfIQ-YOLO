import { describe, expect, it } from 'vitest';

import { hashToBucket, inRollout } from '../../../shared/caddie/rollout';

describe('hashToBucket', () => {
  it('returns the same bucket for the same identifier', () => {
    const id = 'device-123';
    const first = hashToBucket(id);
    const second = hashToBucket(id);
    expect(first).toBe(second);
  });

  it('maps identifiers into the 0-99 range', () => {
    const ids = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    ids.forEach((id) => {
      const bucket = hashToBucket(id);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    });
  });
});

describe('inRollout', () => {
  it('never includes ids when percent is 0 and always when 100', () => {
    expect(inRollout('any-id', 0)).toBe(false);
    expect(inRollout('any-id', -10)).toBe(false);
    expect(inRollout('any-id', 100)).toBe(true);
    expect(inRollout('any-id', 150)).toBe(true);
  });

  it('includes ids when the rollout threshold exceeds the bucket', () => {
    const id = 'rollout-check';
    const bucket = hashToBucket(id);
    expect(inRollout(id, bucket)).toBe(false);
    expect(inRollout(id, bucket + 1)).toBe(true);
  });
});
