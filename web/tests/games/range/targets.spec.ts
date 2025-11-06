import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTargets, isHit } from '../../../../shared/games/range/targets';

const approx = (actual: number, expected: number, tol = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} ≈ ${expected}`);

test('buildTargets enforces min/max radius and alternating lateral offsets', () => {
  const targets = buildTargets([80, 120, 350], 5);
  assert.equal(targets.length, 3);
  assert.equal(targets[0].radius_m, 4);
  assert.equal(targets[1].radius_m, Math.round(120 * 0.03));
  assert.equal(targets[2].radius_m, 10);
  approx(targets[0].center.y, -5);
  approx(targets[1].center.y, 5);
  approx(targets[2].center.y, -5);
});

test('isHit detects points within ring radius', () => {
  const [target] = buildTargets([100]);
  assert.equal(isHit(target, target.center), true);
  assert.equal(isHit(target, { x: target.center.x + target.radius_m * 0.5, y: target.center.y }), true);
  assert.equal(
    isHit(target, { x: target.center.x + target.radius_m + 0.01, y: target.center.y }),
    false,
  );
});
