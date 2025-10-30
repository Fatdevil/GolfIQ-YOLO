import assert from 'node:assert/strict';
import test from 'node:test';

import { __resetMemoryStoreForTests } from '../../../shared/core/pstore';
import {
  isCoachLearningActive,
  isCoachLearningOptedIn,
  setCoachLearningOptIn,
} from '../../../shared/coach/profile';

test('coach learning gate respects opt-in and RC toggle', async () => {
  __resetMemoryStoreForTests();
  await setCoachLearningOptIn(false);

  const rcEnabled = { coach: { learningEnabled: true } } as const;
  const rcDisabled = { coach: { learningEnabled: false } } as const;

  assert.equal(await isCoachLearningOptedIn(), false);
  assert.equal(await isCoachLearningActive(rcEnabled), false);

  await setCoachLearningOptIn(true);
  assert.equal(await isCoachLearningOptedIn(), true);
  assert.equal(await isCoachLearningActive(rcEnabled), true);
  assert.equal(await isCoachLearningActive(rcDisabled), false);
});

test.after(async () => {
  await setCoachLearningOptIn(false);
});
