import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlayerProfile } from '../../../shared/coach/profile';
import * as policy from '../../../shared/coach/policy';
import { recommendPlan } from '../../../shared/training/scheduler';
import type { Plan, TrainingFocus } from '../../../shared/training/types';

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

const makePlan = (id: string, focus: TrainingFocus): Plan => ({
  id,
  name: id,
  focus,
  version: '1.0',
  drills: [],
});

const plansByFocus: Partial<Record<TrainingFocus, Plan[]>> = {
  approach: [makePlan('approach-plan', 'approach')],
  putt: [makePlan('putt-plan', 'putt')],
};

test('recommendPlan falls back to default when learning is inactive', async (t) => {
  const rankSpy = t.mock.method(policy, 'rankFocus', () => [
    { focus: 'putt' as TrainingFocus, score: 0.9 },
  ]);

  const recommendation = recommendPlan(plansByFocus, profile, 'approach', {
    learningActive: false,
  });

  assert.equal(recommendation.focus, 'approach');
  assert.equal(rankSpy.mock.callCount(), 0);

  t.mock.restoreAll();
});

test('recommendPlan uses ranked focus when learning is active', async (t) => {
  const rankSpy = t.mock.method(policy, 'rankFocus', () => [
    { focus: 'putt' as TrainingFocus, score: 0.9 },
  ]);

  const recommendation = recommendPlan(plansByFocus, profile, 'approach', {
    learningActive: true,
  });

  assert.equal(recommendation.focus, 'putt');
  assert.equal(recommendation.plan?.id, 'putt-plan');
  assert.equal(rankSpy.mock.callCount(), 1);

  t.mock.restoreAll();
});
