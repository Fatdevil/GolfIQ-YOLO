import assert from 'node:assert/strict';
import test from 'node:test';

import { runSim, type BundleFeature } from '../../../shared/caddie/sim';

const rect = (kind: 'fairway' | 'green' | 'hazard', x1: number, y1: number, x2: number, y2: number): BundleFeature => ({
  kind,
  rings: [
    [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
      { x: x1, y: y1 },
    ],
  ],
});

const FAIRWAY: BundleFeature = rect('fairway', -20, 0, 20, 260);

const HAZARD_NEAR_TARGET: BundleFeature = rect('hazard', -12, 180, 12, 210);

const GREEN_TARGET: BundleFeature = rect('green', -12, 210, 12, 240);

test('runSim produces identical output when seed and inputs match', () => {
  const baseOpts = {
    samples: 600,
    seed: 12345,
    longSigma_m: 12,
    latSigma_m: 7,
    range_m: 220,
    aimDeg: 0,
    features: [FAIRWAY, GREEN_TARGET],
  } as const;
  const resultA = runSim(baseOpts);
  const resultB = runSim({ ...baseOpts });
  assert.deepEqual(resultA, resultB);
});

test('crosswind increases lateral miss magnitude', () => {
  const calm = runSim({
    samples: 500,
    seed: 777,
    longSigma_m: 10,
    latSigma_m: 6,
    range_m: 200,
    aimDeg: 0,
    windCross_mps: 0,
    features: [FAIRWAY],
  });
  const windy = runSim({
    samples: 500,
    seed: 777,
    longSigma_m: 10,
    latSigma_m: 6,
    range_m: 200,
    aimDeg: 0,
    windCross_mps: 8,
    features: [FAIRWAY],
  });
  assert.ok(
    Math.abs(windy.expLatMiss_m) > Math.abs(calm.expLatMiss_m),
    `expected crosswind to increase lateral miss: calm=${calm.expLatMiss_m}, windy=${windy.expLatMiss_m}`,
  );
});

test('hazard near target increases hazard probability', () => {
  const safe = runSim({
    samples: 700,
    seed: 9001,
    longSigma_m: 11,
    latSigma_m: 6,
    range_m: 195,
    aimDeg: 0,
    features: [FAIRWAY, GREEN_TARGET],
  });
  const risky = runSim({
    samples: 700,
    seed: 9001,
    longSigma_m: 11,
    latSigma_m: 6,
    range_m: 195,
    aimDeg: 0,
    features: [FAIRWAY, GREEN_TARGET, HAZARD_NEAR_TARGET],
  });
  assert.ok(risky.pHazard > safe.pHazard, 'hazard probability should increase when hazard is present');
  assert.ok(risky.pHazard > 0.05, `expected noticeable hazard probability, got ${risky.pHazard}`);
});
