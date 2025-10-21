import assert from 'node:assert/strict';
import test from 'node:test';

import { computeGhostTrajectory } from '../../../shared/arhud/ballistics';

const START = { lat: 37.7749, lon: -122.4194 };
const TARGET = { lat: 37.7754, lon: -122.4144 };

function last<T>(items: T[]): T {
  return items[items.length - 1];
}

test('ghost trajectory samples stay monotonic and reach plays-like range', () => {
  const result = computeGhostTrajectory({ startLatLon: START, targetLatLon: TARGET, playsLike_m: 155 });
  assert.ok(result, 'expected a trajectory');
  const { path } = result!;
  assert.equal(path.length, 40);
  let previous = 0;
  for (const sample of path) {
    assert.ok(
      sample.x >= previous - 1e-6,
      `expected x to be monotonic, got ${sample.x} after ${previous}`,
    );
    previous = sample.x;
  }
  const maxHeight = path.reduce((max, sample) => Math.max(max, sample.y), 0);
  assert.ok(maxHeight > 0, 'expected apex to lift above ground');
  const finalRange = last(path).x;
  assert.ok(Math.abs(finalRange - 155) <= 2, `expected range near 155 m, got ${finalRange}`);
});

test('crosswind sign carries through to lateral drift', () => {
  const leftWind = computeGhostTrajectory({
    startLatLon: START,
    targetLatLon: TARGET,
    playsLike_m: 180,
    wind_mps: 6,
    cross_from_deg: 270,
  });
  const rightWind = computeGhostTrajectory({
    startLatLon: START,
    targetLatLon: TARGET,
    playsLike_m: 180,
    wind_mps: 6,
    cross_from_deg: 90,
  });
  assert.ok(leftWind && rightWind);
  assert.ok(leftWind!.lateral_m > 0, `expected positive lateral drift, got ${leftWind?.lateral_m}`);
  assert.ok(rightWind!.lateral_m < 0, `expected negative lateral drift, got ${rightWind?.lateral_m}`);
});
