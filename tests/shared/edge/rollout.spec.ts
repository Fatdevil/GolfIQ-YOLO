import assert from 'node:assert/strict';
import test from 'node:test';

import { hashToBucket, inRollout } from '../../../shared/edge/rollout';

test('hashToBucket returns stable bucket for identical ids', () => {
  const id = 'device-123';
  const first = hashToBucket(id);
  const second = hashToBucket(id);
  assert.equal(first, second);
  assert.ok(first >= 0 && first < 100);
});

test('inRollout clamps percentages and respects bucket thresholds', () => {
  const id = 'device-456';
  assert.equal(inRollout(id, -10), false);
  assert.equal(inRollout(id, 0), false);
  assert.equal(inRollout(id, 100), true);
  assert.equal(inRollout(id, 150), true);
  const bucket = hashToBucket(id);
  assert.equal(inRollout(id, bucket), false);
  assert.equal(inRollout(id, bucket + 1), true);
});
