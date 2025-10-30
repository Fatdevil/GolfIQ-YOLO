import assert from 'node:assert/strict';
import test from 'node:test';

import type { CourseBundle, CourseFeature } from '../../../shared/arhud/bundle_client';
import { CLUB_SEQUENCE, type ClubId } from '../../../shared/playslike/bag';
import { planTeeShotMC, type ShotPlan } from '../../../shared/caddie/strategy';
import type { PlayerModel } from '../../../shared/caddie/player_model';

const originalRc = (globalThis as Record<string, unknown>).RC;

const createPlayer = (): PlayerModel => {
  const clubs: Record<ClubId, { carry_m: number; sigma_long_m: number; sigma_lat_m: number }> = {};
  CLUB_SEQUENCE.forEach((club, index) => {
    clubs[club] = {
      carry_m: 150 + index * 10,
      sigma_long_m: 10,
      sigma_lat_m: 6,
    };
  });
  return { clubs, tuningActive: false };
};

const tee = { lat: 0, lon: 0 };
const pin = { lat: 0.0019, lon: 0 };

const createHazardFeature = (): CourseFeature => ({
  id: 'hazard-east',
  type: 'Feature',
  properties: { type: 'hazard' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0.00012, 0.0016],
        [0.00024, 0.0016],
        [0.00024, 0.0021],
        [0.00012, 0.0021],
        [0.00012, 0.0016],
      ],
    ],
  },
});

const bundle: CourseBundle = {
  courseId: 'mc-test',
  version: 1,
  ttlSec: 3600,
  features: [createHazardFeature()],
  greensById: {},
};

const runPlan = (riskMode: 'safe' | 'normal' | 'aggressive', rcRisk: number): ShotPlan => {
  (globalThis as Record<string, unknown>).RC = { riskMax: rcRisk };
  return planTeeShotMC({
    bundle,
    tee,
    pin,
    player: createPlayer(),
    riskMode,
    wind: { speed_mps: 0, from_deg: 0 },
    useMC: true,
    mcSamples: 600,
  });
};

test('MC tee planner prefers safer aim when risk exceeds gate', () => {
  const plan = runPlan('normal', 0.12);
  assert.equal(plan.aimDirection, 'LEFT', `expected left bias, got ${plan.aimDirection}`);
  assert.ok(plan.mc, 'expected MC result');
  assert.ok(
    (plan.mc?.hazardRate ?? 1) <= 0.2,
    `expected hazard rate to be gated, got ${plan.mc?.hazardRate}`,
  );
});

test('Aggressive mode reduces left bias compared to safe mode', () => {
  const safePlan = runPlan('safe', 0.25);
  const aggressivePlan = runPlan('aggressive', 0.25);
  assert.ok(safePlan.aim.lateral_m < 0, 'safe plan should favor left side');
  assert.ok(aggressivePlan.aim.lateral_m < 0, 'aggressive plan still aims left of hazard');
  assert.ok(
    Math.abs(aggressivePlan.aim.lateral_m) < Math.abs(safePlan.aim.lateral_m),
    `expected aggressive aim (${aggressivePlan.aim.lateral_m}) closer to center than safe (${safePlan.aim.lateral_m})`,
  );
});

test.after(() => {
  (globalThis as Record<string, unknown>).RC = originalRc;
});
