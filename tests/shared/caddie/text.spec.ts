import assert from 'node:assert/strict';
import test from 'node:test';

import type { ShotPlan } from '../../../shared/caddie/strategy';
import { caddieTipToText } from '../../../shared/caddie/text';

test('caddieTipToText emits deterministic summary lines', () => {
  const plan: ShotPlan = {
    kind: 'tee',
    club: 'D',
    target: { lat: 37.7, lon: -122.4 },
    aimDeg: 3.2,
    aimDirection: 'RIGHT',
    reason: 'Leaves 150 m for next shot.',
    risk: 0.25,
    landing: { distance_m: 240, lateral_m: 4.2 },
    aim: { lateral_m: -1.5 },
    mode: 'safe',
    carry_m: 245,
    crosswind_mps: 3,
    headwind_mps: -1,
    windDrift_m: 4,
    tuningActive: true,
  };
  const lines = caddieTipToText(plan, { mode: 'safe' });
  assert.deepEqual(lines, [
    'SAFE: D till landningszon 240 m, Sikta 3.2° höger, Risk≈25%.',
    'Vind 3.0 m/s vänster→höger. Drift≈4.0 m.',
    'Tuning aktiv – personlig dispersion används.',
    'Leaves 150 m for next shot.',
  ]);
});
