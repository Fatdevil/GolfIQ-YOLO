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

const RIGHT_STRIP_HAZARD: BundleFeature = rect('hazard', 9.5, 190, 10.5, 210);

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

test('expected lateral miss ignores deterministic aim and drift', () => {
  const range = 200;
  const aimOffsetMeters = 10;
  const aimDeg = (Math.atan(aimOffsetMeters / range) * 180) / Math.PI;
  const baseOpts = {
    samples: 400,
    seed: 2468,
    longSigma_m: 0.2,
    latSigma_m: 0.2,
    range_m: range,
    aimDeg,
    windCross_mps: 0,
    features: [FAIRWAY, RIGHT_STRIP_HAZARD],
  } as const;
  const calm = runSim(baseOpts);

  assert.ok(
    Math.abs(calm.expLatMiss_m) < 0.05,
    `expected near-zero lateral noise miss, got ${calm.expLatMiss_m}`,
  );
  assert.ok(
    calm.pHazard > 0.6,
    `expected hazard probability to reflect aimed offset, got ${calm.pHazard}`,
  );

  const windy = runSim({ ...baseOpts, windCross_mps: 13.6 });

  assert.ok(
    Math.abs(windy.expLatMiss_m) < 0.05,
    `expected near-zero lateral noise miss with crosswind, got ${windy.expLatMiss_m}`,
  );
  assert.ok(
    Math.abs(windy.pHazard - calm.pHazard) > 0.4,
    `expected hazard probability to change with deterministic drift: calm=${calm.pHazard}, windy=${windy.pHazard}`,
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
