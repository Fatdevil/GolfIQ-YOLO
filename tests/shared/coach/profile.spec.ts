import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultProfile,
  decay,
  resetPlayerProfile,
  updateFromPractice,
  updateFromRound,
} from '../../../shared/coach/profile';

const focuses = [
  'long-drive',
  'tee',
  'approach',
  'wedge',
  'short',
  'putt',
  'recovery',
] as const;

test('createDefaultProfile initializes equal weights', () => {
  const profile = createDefaultProfile('tester', new Date('2025-01-01T00:00:00Z'));
  assert.equal(profile.version, '1.0');
  const weights = focuses.map((focus) => profile.focusWeights[focus]);
  weights.forEach((weight) => {
    assert.ok(weight > 0);
  });
  const sum = weights.reduce((acc, value) => acc + value, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6);
});

test('updateFromPractice boosts adherence and focus weight when completed', () => {
  const base = createDefaultProfile('tester');
  const completed = updateFromPractice(base, { focus: 'putt', completed: true, sgDelta: -0.2 });
  assert.ok(completed.adherenceScore > base.adherenceScore);
  assert.ok(completed.focusWeights.putt > base.focusWeights.putt);
  const skipped = updateFromPractice(completed, { focus: 'putt', completed: false });
  assert.ok(skipped.adherenceScore < completed.adherenceScore);
});

test('updateFromRound updates sg lifts and risk preference', () => {
  const base = createDefaultProfile('tester');
  const roundUpdated = updateFromRound(base, {
    adopt: false,
    sgLift: { putt: -0.6, approach: 0.2 },
  });
  assert.ok(roundUpdated.sgLiftByFocus.putt !== undefined);
  assert.equal(roundUpdated.riskPreference, 'safe');
  const positive = updateFromRound(roundUpdated, {
    adopt: true,
    sgLift: { approach: 0.4, short: 0.3 },
  });
  assert.ok((positive.sgLiftByFocus.approach ?? 0) >= (roundUpdated.sgLiftByFocus.approach ?? 0));
});

test('decay nudges weights toward uniform baseline', () => {
  const base = createDefaultProfile('tester');
  const boosted = {
    ...base,
    updatedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    focusWeights: {
      ...base.focusWeights,
      putt: 0.4,
      approach: 0.05,
    },
    sgLiftByFocus: { putt: -0.5 },
    adherenceScore: 0.9,
  };
  const decayed = decay(boosted, new Date(), 7);
  assert.ok(decayed.focusWeights.putt < boosted.focusWeights.putt);
  assert.ok(Math.abs(decayed.focusWeights.approach - boosted.focusWeights.approach) < 0.1);
  assert.ok((decayed.sgLiftByFocus.putt ?? 0) > (boosted.sgLiftByFocus.putt ?? 0));
  assert.ok(decayed.adherenceScore < boosted.adherenceScore);
});


test.after(async () => {
  await resetPlayerProfile('tester');
});
