import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearTrainingPackCache,
  getDrillsByFocus,
  getPlansByFocus,
  loadTrainingPacks,
} from '../../../shared/training/content_loader';

const expectPack = (packs: Awaited<ReturnType<typeof loadTrainingPacks>>, packId: string) => {
  const pack = packs.find((entry) => entry.packId === packId);
  assert.ok(pack, `expected pack ${packId} to be present`);
  return pack;
};

test('bundled training packs expose putting & long-drive content', async (t) => {
  clearTrainingPackCache();
  const packs = await loadTrainingPacks();
  const packIds = new Set(packs.map((pack) => pack.packId));
  assert.ok(packIds.has('putting_v1'));
  assert.ok(packIds.has('long_drive_v1'));

  await t.test('putting pack metadata', () => {
    const putting = expectPack(packs, 'putting_v1');
    assert.equal(putting.drills.length, 2, 'putting pack should expose 2 drills');
    assert.equal(putting.plans.length, 1, 'putting pack should expose 1 plan');
    const plan = putting.plans[0];
    assert.equal(plan.id, 'putt-week-1');
    assert.equal(plan.drills.length, 2);
  });

  await t.test('long-drive pack metadata', () => {
    const longDrive = expectPack(packs, 'long_drive_v1');
    assert.equal(longDrive.drills.length, 2, 'long-drive pack should expose 2 drills');
    assert.equal(longDrive.plans.length, 1, 'long-drive pack should expose 1 plan');
    const plan = longDrive.plans[0];
    assert.equal(plan.id, 'ld-week-1');
    assert.equal(plan.drills.length, 2);
  });

  await t.test('focus helpers expose expected plans & drills', () => {
    const puttingPlans = getPlansByFocus('putt').filter((plan) => plan.id === 'putt-week-1');
    assert.equal(puttingPlans.length, 1);
    assert.equal(puttingPlans[0].drills.length, 2);

    const longDrivePlans = getPlansByFocus('long-drive').filter((plan) => plan.id === 'ld-week-1');
    assert.equal(longDrivePlans.length, 1);

    const longDriveDrills = getDrillsByFocus('long-drive');
    const drillIds = new Set(longDriveDrills.map((drill) => drill.id));
    assert.ok(drillIds.has('ld-tee-height-ab'));
    assert.ok(drillIds.has('ld-tempo-80pc'));
  });

  clearTrainingPackCache();
});
