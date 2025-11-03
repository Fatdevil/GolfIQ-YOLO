import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseStrategy, type StrategyInput } from '../../../shared/caddie/strategy';
import { gameCtxStore } from '../../../shared/game/context';
import { defaultGameContext } from '../../../shared/game/types';

const baseInput: StrategyInput = {
  rawDist_m: 150,
  playsLikeFactor: 1,
  hazard: { water: 0.1, bunker: 0.05, rough: 0.1, ob: 0.02, fairway: 0.55 },
  dispersion: { sigma_m: 12, lateralSigma_m: 7 },
  laneWidth_m: 28,
  profile: 'neutral',
  dangerSide: 'left',
};

const resetGameContext = () => {
  gameCtxStore.set({
    ...defaultGameContext,
    myScoreToPar: undefined,
    position: undefined,
    strokesBehind: undefined,
  });
};

test('water hazard increases fat-side aim offset', () => {
  resetGameContext();
  const conservative = chooseStrategy({ ...baseInput });
  const higherWater = chooseStrategy({
    ...baseInput,
    hazard: { ...baseInput.hazard, water: 0.3 },
  });

  assert.ok(
    Math.abs(higherWater.recommended.offset_m) > Math.abs(conservative.recommended.offset_m) + 0.01,
    `expected larger offset when water hazard increases (${higherWater.recommended.offset_m} vs ${conservative.recommended.offset_m})`,
  );
  assert.ok(
    higherWater.recommended.offset_m >= conservative.recommended.offset_m - 1e-6,
    'expected aim to remain on or shift further to the fat side',
  );
});

test('risk profiles adjust offsets and distance preference', () => {
  resetGameContext();
  const conservative = chooseStrategy({ ...baseInput, profile: 'conservative' });
  const aggressive = chooseStrategy({ ...baseInput, profile: 'aggressive' });

  assert.ok(
    Math.abs(aggressive.recommended.offset_m) <= Math.abs(conservative.recommended.offset_m) + 0.01,
    'aggressive profile should not aim further from danger than conservative',
  );
  assert.ok(
    aggressive.recommended.carry_m >= conservative.recommended.carry_m - 0.5,
    'aggressive profile should favor the longer carry',
  );
});

test('bounds respected for offset and carry sampling', () => {
  resetGameContext();
  const bounded = chooseStrategy({
    ...baseInput,
    bounds: { maxOffset_m: 5, minCarry_m: 140, maxCarry_m: 160 },
  });

  assert.ok(Math.abs(bounded.recommended.offset_m) <= 5 + 1e-6, 'max offset bound enforced');
  assert.ok(bounded.recommended.carry_m >= 140 - 1e-6, 'min carry bound enforced');
  assert.ok(bounded.recommended.carry_m <= 160 + 1e-6, 'max carry bound enforced');
});

test('plays-like factor increases recommended carry', () => {
  resetGameContext();
  const neutral = chooseStrategy({ ...baseInput, playsLikeFactor: 1.0 });
  const elevated = chooseStrategy({ ...baseInput, playsLikeFactor: 1.08 });

  assert.ok(
    elevated.recommended.carry_m > neutral.recommended.carry_m + 0.5,
    'higher plays-like factor should yield longer carry recommendation',
  );
});

test('invalid inputs fall back to safe defaults', () => {
  resetGameContext();
  const decision = chooseStrategy({
    rawDist_m: Number.NaN,
    playsLikeFactor: Number.NaN,
    hazard: {
      water: Number.NaN,
      bunker: Number.NaN,
      rough: Number.NaN,
      ob: Number.NaN,
      fairway: Number.NaN,
    },
    dispersion: { sigma_m: Number.NaN, lateralSigma_m: Number.NaN },
    laneWidth_m: Number.NaN,
    profile: 'neutral',
  });

  assert.ok(Number.isFinite(decision.evScore), 'EV score should be finite');
  assert.ok(Number.isFinite(decision.recommended.carry_m), 'carry should be finite');
  assert.ok(Number.isFinite(decision.recommended.offset_m), 'offset should be finite');
});
