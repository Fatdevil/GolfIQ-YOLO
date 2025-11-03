import assert from 'node:assert/strict';
import test from 'node:test';

import { applyGameRiskBias, applyGameRiskProfile, gameCtxStore } from '../../../shared/game/context';
import { defaultGameContext } from '../../../shared/game/types';

const resetContext = () => {
  gameCtxStore.set({
    ...defaultGameContext,
    myScoreToPar: undefined,
    position: undefined,
    strokesBehind: undefined,
  });
};

test('game context derives holesRemaining when holeIndex updates', { concurrency: false }, () => {
  resetContext();
  gameCtxStore.set({ holeIndex: 8 });
  const state = gameCtxStore.get();
  assert.equal(state.holesRemaining, 9);
});

test('risk mode becomes aggressive when trailing late', { concurrency: false }, () => {
  resetContext();
  gameCtxStore.set({ holeIndex: 15, strokesBehind: 2 });
  const state = gameCtxStore.get();
  assert.equal(state.riskMode, 'aggressive');
});

test('risk mode becomes conservative when leading late', { concurrency: false }, () => {
  resetContext();
  gameCtxStore.set({ holeIndex: 16, position: 1, strokesBehind: 0, myScoreToPar: -4 });
  const state = gameCtxStore.get();
  assert.equal(state.riskMode, 'conservative');
});

test('applyGameRiskBias nudges towards conservative/aggressive', { concurrency: false }, () => {
  resetContext();
  gameCtxStore.set({ riskMode: 'aggressive' });
  assert.equal(applyGameRiskBias('normal'), 'aggressive');
  gameCtxStore.set({ riskMode: 'conservative' });
  assert.equal(applyGameRiskBias('aggressive'), 'normal');
  resetContext();
});

test('applyGameRiskProfile shifts risk profile selection', { concurrency: false }, () => {
  resetContext();
  assert.equal(applyGameRiskProfile('neutral'), 'neutral');
  gameCtxStore.set({ riskMode: 'aggressive' });
  assert.equal(applyGameRiskProfile('neutral'), 'aggressive');
  gameCtxStore.set({ riskMode: 'conservative' });
  assert.equal(applyGameRiskProfile('aggressive'), 'neutral');
  resetContext();
});
