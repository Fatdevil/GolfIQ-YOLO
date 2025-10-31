import assert from 'node:assert/strict';
import test from 'node:test';

import { inferDangerSide } from '../../../shared/caddie/hazards';

test('Water Right label infers right side', () => {
  const result = inferDangerSide({
    breakdown: ['Water Right'],
  });
  assert.equal(result, 'right');
});

test('OB abbreviations favor the right side', () => {
  const result = inferDangerSide({
    breakdown: ['OB R', 'OB (R)'],
  });
  assert.equal(result, 'right');
});

test('Left bunker keywords are detected', () => {
  const result = inferDangerSide({
    breakdown: ['Bunker (Left)', 'Left Bunker'],
  });
  assert.equal(result, 'left');
});

test('Severity and rate weighting picks the higher risk side', () => {
  const result = inferDangerSide({
    breakdown: [
      { name: 'Water Right', rate: 0.08 },
      { name: 'Bunker Left', rate: 0.04 },
    ],
  });
  assert.equal(result, 'right');
});

test('Swedish tokens are recognised for direction', () => {
  const left = inferDangerSide({ breakdown: ['Vänster Bunker'] });
  const right = inferDangerSide({ breakdown: ['Höger OB'] });
  assert.equal(left, 'left');
  assert.equal(right, 'right');
});

test('Metadata overrides labels when higher value', () => {
  const result = inferDangerSide({
    reasons: [
      { kind: 'hazard', meta: { direction: 'left' }, value: 0.3 },
      { kind: 'hazard', meta: { direction: 'right' }, value: 0.6 },
    ],
    breakdown: ['Water Left'],
  });
  assert.equal(result, 'right');
});

test('Unknown directions yield null', () => {
  const result = inferDangerSide({
    breakdown: ['Center Fairway', 'Green'],
  });
  assert.equal(result, null);
});

test('NaN and malformed labels do not throw', () => {
  const result = inferDangerSide({
    breakdown: [
      { name: '', rate: Number.NaN },
      // @ts-expect-error testing resilience to odd values
      { bogus: true },
      { name: '???', rate: -2 },
    ],
    rates: {
      water: Number.NaN,
      bunker: Number.NaN,
      rough: Number.NaN,
      ob: Number.NaN,
      fairway: Number.NaN,
    },
  });
  assert.equal(result, null);
});
