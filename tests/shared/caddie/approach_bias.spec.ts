import assert from 'node:assert/strict';
import test from 'node:test';

import type { CourseBundle } from '../../../shared/arhud/bundle_client';
import { planApproach } from '../../../shared/caddie/strategy';
import { buildPlayerModel } from '../../../shared/caddie/player_model';
import { defaultBag } from '../../../shared/playslike/bag';

const ORIGIN = { lat: 37.7749, lon: -122.4194 };
const EARTH_RADIUS_M = 6_378_137;

function toLatLon(x: number, y: number): { lat: number; lon: number } {
  const latOffset = (y / EARTH_RADIUS_M) * (180 / Math.PI);
  const lonOffset =
    (x / (EARTH_RADIUS_M * Math.cos((ORIGIN.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: ORIGIN.lat + latOffset, lon: ORIGIN.lon + lonOffset };
}

function ringFromLocal(points: Array<{ x: number; y: number }>): number[][] {
  return points.map(({ x, y }) => {
    const geo = toLatLon(x, y);
    return [geo.lon, geo.lat];
  });
}

const GREEN_RING = ringFromLocal([
  { x: -12, y: 170 },
  { x: 12, y: 170 },
  { x: 12, y: 195 },
  { x: -12, y: 195 },
  { x: -12, y: 170 },
]);

const RIGHT_HAZARD_RING = ringFromLocal([
  { x: 20, y: 160 },
  { x: 48, y: 160 },
  { x: 48, y: 205 },
  { x: 20, y: 205 },
  { x: 20, y: 160 },
]);

const bundle: CourseBundle = {
  courseId: 'bias-demo',
  version: 1,
  ttlSec: 3600,
  features: [
    {
      id: 'g1',
      type: 'Feature',
      properties: { type: 'green' },
      geometry: { type: 'Polygon', coordinates: [GREEN_RING] },
    },
    {
      id: 'h1',
      type: 'Feature',
      properties: { type: 'hazard' },
      geometry: { type: 'Polygon', coordinates: [RIGHT_HAZARD_RING] },
    },
  ],
  greensById: {
    g1: { sections: ['front', 'middle', 'back'], fatSide: 'L' },
  },
};

const player = buildPlayerModel({ bag: defaultBag() });
const ball = ORIGIN;
const pin = toLatLon(0, 185);

function makePlan(mode: 'safe' | 'normal' | 'aggressive') {
  return planApproach({
    bundle,
    ball,
    pin,
    player,
    riskMode: mode,
    wind: { speed_mps: 0, from_deg: 0 },
  });
}

test('fat-side metadata biases approach aim toward safer side', () => {
  const normalPlan = makePlan('normal');
  assert.equal(normalPlan.kind, 'approach');
  assert.equal(normalPlan.fatSide, 'L');
  assert.equal(normalPlan.greenSection, 'middle');
  assert.ok(
    normalPlan.aim.lateral_m < -1,
    `expected normal plan to favour left, got ${normalPlan.aim.lateral_m.toFixed(2)} m`,
  );

  const aggressivePlan = makePlan('aggressive');
  assert.equal(aggressivePlan.fatSide, 'L');
  assert.ok(
    aggressivePlan.aim.lateral_m <= 0,
    `aggressive mode should not aim into hazard side, got ${aggressivePlan.aim.lateral_m.toFixed(2)} m`,
  );
  assert.ok(
    aggressivePlan.aim.lateral_m >= normalPlan.aim.lateral_m,
    'aggressive mode should reduce (soften) the left bias',
  );
});
