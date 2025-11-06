import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROUND_FILE_NAME,
  __resetRoundStoreForTests,
  __setRoundIdFactoryForTests,
  __setRoundStorageForTests,
  addShot,
  createRound,
  finishRound,
  getActiveRound,
  loadRound,
  nextHole,
  parseRoundPayload,
  prevHole,
  resumeRound,
  saveRound,
  serializeRound,
  setScore,
  setHandicapSetup,
} from '../../../shared/round/round_store';
import type { Shot } from '../../../shared/round/round_types';

test('round store create → mutate → persist → resume', async () => {
  const records = new Map<string, string>();
  const storage = {
    async getItem(key: string): Promise<string | null> {
      return records.has(key) ? records.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      records.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      records.delete(key);
    },
  };

  __resetRoundStoreForTests();
  __setRoundStorageForTests(storage);
  __setRoundIdFactoryForTests(() => 'round-test-id');

  const initial = createRound('qa-course', [1, 2], { 1: 4, 2: 3 }, 'white');
  assert.equal(initial.id, 'round-test-id');
  assert.equal(initial.courseId, 'qa-course');
  assert.equal(initial.tee, 'white');
  assert.equal(initial.holes.length, 2);
  assert.equal(initial.currentHole, 0);

  const teeShot: Shot = {
    tStart: 1_700_000_000,
    tEnd: 1_700_000_500,
    club: 'D',
    base_m: 230,
    playsLike_m: 225,
    carry_m: 240,
    pin: { lat: 37.1, lon: -122.1 },
    land: { lat: 37.1005, lon: -122.099 },
  };
  addShot(1, teeShot);
  setScore(1, 4);

  setHandicapSetup({
    handicapIndex: 12.4,
    allowancePct: 95,
    tee: {
      id: 'blue',
      name: 'Blue',
      slope: 125,
      rating: 71.2,
      par: 72,
      strokeIndex: Array.from({ length: 18 }, (_, i) => i + 1),
    },
  });

  const withHandicap = getActiveRound();
  assert(withHandicap?.handicapSetup);
  assert.equal(withHandicap?.handicapSetup?.allowancePct, 95);
  assert.equal(withHandicap?.handicapSetup?.tee.nine, undefined);

  nextHole();
  const afterNext = getActiveRound();
  assert(afterNext);
  assert.equal(afterNext!.currentHole, 1);
  prevHole();
  const afterPrev = getActiveRound();
  assert(afterPrev);
  assert.equal(afterPrev!.currentHole, 0);
  nextHole();

  const approach: Shot = {
    tStart: 1_700_000_800,
    club: '7i',
    base_m: 150,
    playsLike_m: 148,
    carry_m: 151,
    pin: { lat: 37.101, lon: -122.098 },
    land: { lat: 37.1011, lon: -122.0979 },
  };
  addShot(2, approach);
  setScore(2, 3);

  finishRound();
  const finished = getActiveRound();
  assert(finished?.finished);
  const serialized = serializeRound(finished!);
  const parsed = parseRoundPayload(JSON.parse(serialized));
  assert(parsed);
  assert.equal(parsed!.holes.length, 2);
  assert.equal(parsed!.holes[0].shots.length, 1);

  await saveRound();

  __resetRoundStoreForTests();
  __setRoundStorageForTests(storage);
  __setRoundIdFactoryForTests(() => 'round-test-id');

  const reloaded = await loadRound();
  assert(reloaded);
  assert.equal(reloaded!.id, 'round-test-id');
  assert.equal(reloaded!.holes[0].shots.length, 1);
  assert.equal(reloaded!.holes[1].score, 3);
  assert(reloaded!.finished);
  assert.equal(reloaded!.handicapSetup?.tee.name, 'Blue');
  assert.equal(reloaded!.handicapSetup?.tee.strokeIndex?.length, 18);

  if (parsed) {
    const resumed = resumeRound(parsed);
    assert(resumed);
    assert.equal(resumed!.id, 'round-test-id');
  }

  assert.equal(ROUND_FILE_NAME, 'round_run.json');

  __resetRoundStoreForTests();
  __setRoundStorageForTests(null);
  __setRoundIdFactoryForTests(null);
});
