import assert from 'node:assert/strict';
import test from 'node:test';

import { advise, type AdviceCtx } from '../../../shared/caddie/advice';
import { defaultCoachStyle } from '../../../shared/caddie/style';
import {
  DefaultCoachProvider,
  getCoachProvider,
  setCoachProvider,
  type AdviceCtx as CoachAdviceCtx,
} from '../../../shared/coach/provider';
import type { CoachPersona } from '../../../shared/training/types';

const persona: CoachPersona = {
  id: 'tempo-pro',
  name: 'Tempo Pro',
  version: '1.0',
  focus: ['putt'],
  styleHints: { tone: 'concise', verbosity: 'short' },
};

const baseCtx: AdviceCtx = {
  wind: { head_mps: 0, cross_mps: 0 },
  deltas: { temp_m: 0, alt_m: 0, head_m: 0, slope_m: 0 },
  plan: { club: 'Putter', aimDeg: 0, risk: 0.1, distance_m: 5 },
  dispersion: { sigma_long_m: 3, sigma_lat_m: 2 },
  round: { hole: 1, lastErrors: [], streak: { bogey: 0, birdie: 0 } },
  style: { ...defaultCoachStyle, verbosity: 'normal' },
  focus: 'putt',
  persona,
};

test('coach provider injects extra guidance respecting verbosity', () => {
  const tips = ['Fokusera på rytmen', 'Se linjen'];
  const provider = {
    getPreShotAdvice: (ctx: CoachAdviceCtx) => {
      assert.equal(ctx.focus, 'putt');
      assert.equal(ctx.persona?.id, 'tempo-pro');
      return tips;
    },
  };
  const previous = getCoachProvider();
  try {
    setCoachProvider(provider);
    const advices = advise(baseCtx);
    const injected = advices.filter((item) => item.reason === 'coach_provider');
    assert.equal(injected.length, 2);
    assert.equal(injected[0].message, tips[0]);
    assert.equal(injected[0].severity, 'info');
  } finally {
    setCoachProvider(previous ?? DefaultCoachProvider);
  }
});

test('short verbosity limits provider tips to one entry', () => {
  const provider = {
    getPreShotAdvice: () => ['Tempo', 'Andning'],
  };
  const previous = getCoachProvider();
  try {
    setCoachProvider(provider);
    const ctx: AdviceCtx = {
      ...baseCtx,
      style: { ...baseCtx.style, verbosity: 'short' },
    };
    const advices = advise(ctx);
    const injected = advices.filter((item) => item.reason === 'coach_provider');
    assert.equal(injected.length, 1);
    assert.equal(injected[0].message, 'Tempo');
  } finally {
    setCoachProvider(previous ?? DefaultCoachProvider);
  }
});
