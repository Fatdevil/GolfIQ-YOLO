import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultProfile } from '../../../shared/coach/profile';
import { recommendPlan } from '../../../shared/training/scheduler';
import type { Plan, TrainingFocus } from '../../../shared/training/types';

test('recommendPlan selects top ranked focus plan when profile provided', () => {
  const profile = createDefaultProfile('tester');
  profile.focusWeights = {
    'long-drive': 0.05,
    tee: 0.05,
    approach: 0.5,
    wedge: 0.1,
    short: 0.1,
    putt: 0.1,
    recovery: 0.1,
  };
  profile.sgLiftByFocus = { approach: -0.4 };
  profile.adherenceScore = 0.4;
  const plansByFocus: Partial<Record<TrainingFocus, Plan[]>> = {
    approach: [
      {
        id: 'approach-a',
        name: 'Approach Grinder',
        focus: 'approach',
        version: '1.0',
        drills: [],
      },
    ],
    putt: [
      { id: 'putt-a', name: 'Putting Basics', focus: 'putt', version: '1.0', drills: [] },
    ],
  };
  const recommendation = recommendPlan(plansByFocus, profile, 'putt');
  assert.equal(recommendation.focus, 'approach');
  assert.equal(recommendation.plan?.id, 'approach-a');
});

test('recommendPlan falls back when no profile available', () => {
  const plansByFocus: Partial<Record<TrainingFocus, Plan[]>> = {
    putt: [{ id: 'putt-a', name: 'Putt Plan', focus: 'putt', version: '1.0', drills: [] }],
  };
  const recommendation = recommendPlan(plansByFocus, null, 'putt');
  assert.equal(recommendation.focus, 'putt');
  assert.equal(recommendation.plan?.id, 'putt-a');
});
