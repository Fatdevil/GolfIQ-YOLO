import assert from 'node:assert/strict';
import test from 'node:test';

import type { CourseBundle } from '../../../shared/arhud/bundle_client';
import { planTeeShot, planApproach, type RiskMode } from '../../../shared/caddie/strategy';
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

function buildSyntheticBundle(): CourseBundle {
  const fairwayRing = ringFromLocal([
    { x: -35, y: 0 },
    { x: 35, y: 0 },
    { x: 35, y: 280 },
    { x: -35, y: 280 },
    { x: -35, y: 0 },
  ]);
  const bunkerRing = ringFromLocal([
    { x: 25, y: 180 },
    { x: 55, y: 180 },
    { x: 55, y: 210 },
    { x: 25, y: 210 },
    { x: 25, y: 180 },
  ]);
  return {
    courseId: 'synthetic',
    version: 1,
    ttlSec: 3600,
    features: [
      {
        type: 'Feature',
        properties: { type: 'fairway' },
        geometry: { type: 'Polygon', coordinates: [fairwayRing] },
      },
      {
        type: 'Feature',
        properties: { type: 'bunker' },
        geometry: { type: 'Polygon', coordinates: [bunkerRing] },
      },
    ],
    greensById: {},
  };
}

const bundle = buildSyntheticBundle();
const tee = ORIGIN;
const pin = toLatLon(0, 260);
const bag = defaultBag();
const player = buildPlayerModel({ bag });

function makeTeePlan(mode: RiskMode, goForGreen = false) {
  return planTeeShot({
    bundle,
    tee,
    pin,
    player,
    riskMode: mode,
    wind: { speed_mps: 0, from_deg: 0 },
    goForGreen,
  });
}

test('planTeeShot in normal mode biases away from right-side bunker', () => {
  const plan = makeTeePlan('normal');
  assert.ok(plan.landing.lateral_m < 0, 'expected target left of centre');
  assert.equal(plan.aimDirection, 'LEFT');
  assert.ok(plan.risk < 0.5, 'risk should stay below mid threshold');
});

test('aggressive mode allows longer carry when risk acceptable', () => {
  const normal = makeTeePlan('normal');
  const aggressive = makeTeePlan('aggressive', true);
  assert.ok(aggressive.carry_m >= normal.carry_m, 'aggressive plan should not shorten club');
  assert.ok(aggressive.risk <= 0.6, 'risk should remain controlled');
});

test('planApproach favours fat side of green when hazard present', () => {
  const landing = toLatLon(-5, 150);
  const approach = planApproach({
    bundle,
    ball: landing,
    pin,
    player,
    riskMode: 'normal',
    wind: { speed_mps: 0, from_deg: 0 },
  });
  assert.ok(approach.aimDirection === 'LEFT' || approach.landing.lateral_m <= 0);
});
