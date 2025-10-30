import assert from 'node:assert/strict';
import test from 'node:test';

import { advise, type AdviceCtx } from '../../../shared/caddie/advice';
import { defaultCoachStyle } from '../../../shared/caddie/style';
import type { PlayerProfile } from '../../../shared/coach/profile';
import * as policy from '../../../shared/coach/policy';

const baseCtx: AdviceCtx = {
  wind: { head_mps: 0, cross_mps: 0 },
  deltas: { temp_m: 0, alt_m: 0, head_m: 0, slope_m: 0 },
  plan: { club: '7I', aimDeg: 0, risk: 0.4, distance_m: 150 },
  round: { hole: 1, lastErrors: [], streak: { bogey: 0, birdie: 0 } },
  style: { ...defaultCoachStyle },
};

const profile: PlayerProfile = {
  id: 'tester',
  version: '1.0',
  updatedAt: new Date().toISOString(),
  focusWeights: {
    'long-drive': 1 / 7,
    tee: 1 / 7,
    approach: 1 / 7,
    wedge: 1 / 7,
    short: 1 / 7,
    putt: 1 / 7,
    recovery: 1 / 7,
  },
  riskPreference: 'normal',
  style: { tone: 'neutral', verbosity: 'normal' },
  adherenceScore: 0.5,
  sgLiftByFocus: {},
  adoptRate: 0.5,
};

test('advice keeps defaults when learning gate is disabled', async (t) => {
  const styleSpy = t.mock.method(policy, 'pickAdviceStyle', () => ({ tone: 'pep', verbosity: 'detailed' }));
  const riskSpy = t.mock.method(policy, 'pickRisk', () => 'aggressive');

  const advices = advise({ ...baseCtx, coachProfile: profile, learningActive: false });

  assert.equal(styleSpy.mock.callCount(), 0);
  assert.equal(riskSpy.mock.callCount(), 0);
  assert.ok(Array.isArray(advices));

  t.mock.restoreAll();
});

test('advice applies coach policy when learning gate is enabled', async (t) => {
  const styleSpy = t.mock.method(policy, 'pickAdviceStyle', () => ({ tone: 'pep', verbosity: 'detailed' }));
  const riskSpy = t.mock.method(policy, 'pickRisk', () => 'aggressive');

  const advices = advise({ ...baseCtx, coachProfile: profile, learningActive: true });

  assert.ok(styleSpy.mock.callCount() >= 1);
  assert.ok(riskSpy.mock.callCount() >= 1);
  assert.ok(Array.isArray(advices));

  t.mock.restoreAll();
});
