import assert from 'node:assert/strict';
import test from 'node:test';

import { makeBallisticPath } from '../../../shared/tracer/ballistics';

test('ballistic path normalizes range and apex', () => {
  const result = makeBallisticPath({ carry: 160, apex: 34, samples: 120 });
  assert.ok(result, 'expected ballistic path result');
  assert.equal(result!.points.length, 120);
  const first = result!.points[0]!;
  const last = result!.points[result!.points.length - 1]!;
  assert.deepEqual(first, [0, 0]);
  assert.ok(Math.abs(last[0] - 1) < 1e-6, `expected final x to be 1, got ${last[0]}`);
  assert.ok(last[1] <= 1e-6, `expected final y near ground, got ${last[1]}`);
  const apex = result!.points[result!.apexIndex]!;
  assert.ok(apex[1] > 0.9, `expected apex near 1, got ${apex[1]}`);
});

test('ballistic path clamps sample count to 200', () => {
  const result = makeBallisticPath({ carry: 200, apex: 40, samples: 640 });
  assert.ok(result, 'expected ballistic path');
  assert.ok(result!.points.length <= 200, `expected <= 200 points, got ${result!.points.length}`);
});
