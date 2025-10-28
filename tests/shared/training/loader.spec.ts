import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  clearTrainingPackCache,
  getDrillsByFocus,
  getPlansByFocus,
  loadTrainingPacks,
} from '../../../shared/training/content_loader';

const createPack = async (baseDir: string, name: string, payload: Record<string, unknown>) => {
  const target = path.join(baseDir, `${name}.json`);
  await fs.writeFile(target, JSON.stringify(payload, null, 2), 'utf-8');
};

test('loadTrainingPacks caches packs and exposes focus filters', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'training-packs-'));
  const packsDir = path.join(tmpDir, 'packs');
  await fs.mkdir(packsDir, { recursive: true });
  process.env.TRAINING_PACKS_DIR = packsDir;
  clearTrainingPackCache();

  await createPack(packsDir, 'beta_putting', {
    packId: 'beta',
    version: '1.0',
    drills: [
      {
        id: 'lag-putt',
        focus: 'putt',
        title: 'Lag putting circle',
        description: 'Build speed control inside three metres.',
        estTimeMin: 12,
        targetMetric: { type: 'SG', segment: 'putt' },
        difficulty: 2,
      },
    ],
    plans: [
      {
        id: 'putting-boost',
        name: 'Putting boost',
        focus: 'putt',
        version: '2025.01',
        drills: [
          { id: 'lag-putt', durationMin: 15 },
        ],
        estTotalMin: 20,
      },
    ],
  });

  await createPack(packsDir, 'alpha_drive', {
    packId: 'alpha',
    version: '1.1',
    persona: {
      id: 'power-pro',
      name: 'Power Pro',
      version: '1.0',
      focus: ['long-drive'],
    },
    drills: [
      {
        id: 'tee-bomb',
        focus: 'long-drive',
        title: 'Launch ladder',
        description: 'Ramp up driver launch from 8° to 12°.',
        estTimeMin: 18,
        targetMetric: { type: 'speed', segment: 'long-drive' },
        difficulty: 4,
        requiredGear: ['driver'],
      },
    ],
    plans: [
      {
        id: 'driver-day',
        name: 'Driver day',
        focus: 'long-drive',
        version: '2025.02',
        drills: [
          { id: 'tee-bomb', reps: 6 },
        ],
        schedule: '1x per vecka',
      },
    ],
  });

  await t.test('packs load and sort by packId', async () => {
    const packs = await loadTrainingPacks();
    assert.equal(packs.length, 2);
    assert.deepEqual(
      packs.map((pack) => pack.packId),
      ['alpha', 'beta'],
    );
    const secondCall = await loadTrainingPacks();
    assert.strictEqual(packs, secondCall, 'cache should reuse array instance');
  });

  await t.test('focus helpers expose plans and drills', async () => {
    const puttPlans = getPlansByFocus('putt');
    assert.equal(puttPlans.length, 1);
    assert.equal(puttPlans[0].drills[0].id, 'lag-putt');
    const longDriveDrills = getDrillsByFocus('long-drive');
    assert.equal(longDriveDrills.length, 1);
    assert.equal(longDriveDrills[0].title, 'Launch ladder');
  });

  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.TRAINING_PACKS_DIR;
  clearTrainingPackCache();
});
