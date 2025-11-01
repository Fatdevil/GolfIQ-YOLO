import assert from 'node:assert/strict';
import test from 'node:test';

import { __test as storageTestUtils } from '../../../../shared/round/storage';

const { hydrateRound } = storageTestUtils;

test('hydrateRound enforces pin and shot types', () => {
  const payload = {
    id: 'round-1',
    courseId: 'course',
    startedAt: 10,
    currentHole: 1,
    tournamentSafe: false,
    holes: {
      '1': {
        par: 4,
        index: 3,
        pin: { lat: 1.23, lon: 4.56, bogus: true },
        shots: [
          {
            id: 'shot-1',
            hole: 1,
            seq: 1,
            start: { lat: 1.2, lon: 4.5, ts: 100 },
            startLie: 'Fairway',
            kind: 'Full',
            end: { lat: 1.21, lon: 4.51, ts: 120 },
            endLie: 'Green',
            carry_m: 150,
            toPinStart_m: 160,
            toPinEnd_m: 5,
            sg: 0.25,
          },
          {
            id: 'bad-shot',
            start: { lat: 0, lon: 0 },
            startLie: 'Unknown',
            kind: 'Chip',
          },
        ],
      },
    },
  };

  const round = hydrateRound(payload);
  assert(round);
  const hole = round.holes[1];
  assert.deepEqual(hole.pin, { lat: 1.23, lon: 4.56 });
  assert.equal(hole.shots.length, 1);
  const shot = hole.shots[0];
  assert.equal(shot.endLie, 'Green');
  assert.equal(shot.startLie, 'Fairway');
  assert.equal(shot.toPinStart_m, 160);
});
