import assert from 'node:assert/strict';
import test from 'node:test';

import { advise, type AdviceCtx } from '../../../shared/caddie/advice';
import { defaultCoachStyle } from '../../../shared/caddie/style';

const baseCtx: AdviceCtx = {
  wind: { head_mps: 0, cross_mps: 0 },
  deltas: { temp_m: 0, alt_m: 0, head_m: 0, slope_m: 0 },
  plan: { club: '7I', aimDeg: 0, risk: 0.2, distance_m: 150 },
  dispersion: { sigma_long_m: 8, sigma_lat_m: 5 },
  round: { hole: 1, lastErrors: [], streak: { bogey: 0, birdie: 0 } },
  style: { ...defaultCoachStyle },
};

test('Headwind cues trigger tempo and club adjust', () => {
  const ctx: AdviceCtx = {
    ...baseCtx,
    wind: { head_mps: 4, cross_mps: 0 },
  };
  const advices = advise(ctx);
  const messages = advices.map((item) => item.message);
  assert(messages.includes('headwind_plus_club'));
  assert(messages.includes('headwind_tempo'));
});

test('Crosswind with hazard side triggers bail-out advice', () => {
  const ctx: AdviceCtx = {
    ...baseCtx,
    wind: { head_mps: 0, cross_mps: 3 },
    plan: {
      ...baseCtx.plan,
      risk: 0.5,
      aimDeg: 4.2,
      hazardRightOfAim: true,
    },
  };
  const advices = advise(ctx);
  const messages = advices.map((item) => item.message);
  assert(messages.includes('bail_out_left'));
});

test('Bogey streak triggers mental reset', () => {
  const ctx: AdviceCtx = {
    ...baseCtx,
    round: {
      hole: baseCtx.round.hole,
      lastErrors: baseCtx.round.lastErrors,
      streak: { bogey: 2, birdie: 0 },
    },
  };
  const advices = advise(ctx);
  const messages = advices.map((item) => item.message);
  assert(messages.includes('mental_reset'));
});
