import assert from 'node:assert/strict';
import test from 'node:test';

import { runMonteCarloV1_5 } from '../../../shared/caddie/mc';

const createRectangle = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number }[][] => [
  [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
    { x: x1, y: y1 },
  ],
];

const BASE_ARGS = {
  range_m: 205,
  sigmaLong_m: 11,
  sigmaLat_m: 6,
  samples: 1200,
  wind: { cross: 0, head: 0 },
  pin: { x: 0, y: 210 },
} as const;

test('hazard on the right increases risk vs aiming away', () => {
  const hazardRight = {
    id: 'right-water',
    rings: createRectangle(6, 180, 18, 220),
  };
  const center = runMonteCarloV1_5({
    ...BASE_ARGS,
    aimOffset_m: 0,
    hazards: [hazardRight],
  });
  const leftBias = runMonteCarloV1_5({
    ...BASE_ARGS,
    aimOffset_m: -12,
    hazards: [hazardRight],
  });
  assert.ok(center.hazardRate > 0.08, `expected noticeable hazard rate, got ${center.hazardRate}`);
  assert.ok(
    leftBias.hazardRate < center.hazardRate,
    `expected left aim to reduce risk (${leftBias.hazardRate} < ${center.hazardRate})`,
  );
});

test('strong crosswind increases lateral drift and mean offset', () => {
  const calm = runMonteCarloV1_5({
    ...BASE_ARGS,
    aimOffset_m: 0,
    hazards: [],
  });
  const windy = runMonteCarloV1_5({
    ...BASE_ARGS,
    aimOffset_m: 0,
    wind: { cross: 12, head: 0 },
    hazards: [],
  });
  assert.ok(
    Math.abs(windy.expectedLat_m) > Math.abs(calm.expectedLat_m) + 0.5,
    `expected crosswind to shift mean lateral miss (${windy.expectedLat_m} vs ${calm.expectedLat_m})`,
  );
  assert.ok(
    Math.abs(windy.driftLat_m) > Math.abs(calm.driftLat_m) + 0.5,
    `expected deterministic drift change (${windy.driftLat_m} vs ${calm.driftLat_m})`,
  );
});

test('aiming into hazard raises risk compared to aiming away', () => {
  const hazardLeft = {
    id: 'left-hazard',
    rings: createRectangle(-18, 160, -8, 210),
  };
  const aimLeft = runMonteCarloV1_5({
    ...BASE_ARGS,
    aimOffset_m: -10,
    hazards: [hazardLeft],
  });
  const aimRight = runMonteCarloV1_5({
    ...BASE_ARGS,
    aimOffset_m: 12,
    hazards: [hazardLeft],
  });
  assert.ok(
    aimLeft.hazardRate > aimRight.hazardRate + 0.05,
    `aiming at hazard should be worse (${aimLeft.hazardRate} > ${aimRight.hazardRate})`,
  );
});
