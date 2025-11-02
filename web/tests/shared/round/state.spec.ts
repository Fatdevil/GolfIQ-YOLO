import assert from 'node:assert/strict';
import test from 'node:test';

import { RoundRecorder, __resetRoundRecorderForTests } from '../../../../shared/round/recorder';
import type { GeoPoint, RoundState } from '../../../../shared/round/types';
import { setRoundStore, type RoundStore } from '../../../../shared/round/storage';

class MemoryStore implements RoundStore {
  private state: RoundState | null = null;

  async loadActive(): Promise<RoundState | null> {
    return this.state ? JSON.parse(JSON.stringify(this.state)) : null;
  }

  async save(state: RoundState | null): Promise<void> {
    this.state = state ? JSON.parse(JSON.stringify(state)) : null;
  }

  async newRound(courseId: string, holeCount: number, ts: number, tournamentSafe: boolean): Promise<RoundState> {
    const holes: RoundState['holes'] = {};
    for (let idx = 0; idx < holeCount; idx += 1) {
      const hole = idx + 1;
      holes[hole] = { hole, par: 4, shots: [] };
    }
    const round: RoundState = {
      id: `round-${ts}`,
      courseId,
      startedAt: ts,
      holes,
      currentHole: 1,
      tournamentSafe,
    };
    this.state = JSON.parse(JSON.stringify(round));
    return JSON.parse(JSON.stringify(round));
  }
}

const store = new MemoryStore();

function pt(lat: number, lon: number, ts: number): GeoPoint {
  return { lat, lon, ts };
}

test('round recorder basic flow', async () => {
  __resetRoundRecorderForTests();
  setRoundStore(store);

  const round = await RoundRecorder.startRound('course', 2, 1_000, true);
  assert.equal(round.currentHole, 1);

  const shot = await RoundRecorder.markHit({ club: '7i', lie: 'Fairway', loc: pt(0.001, 0, 1_000) });
  assert.equal(shot.seq, 1);

  const putt = await RoundRecorder.markPutt({ loc: pt(0.0002, 0, 1_500) });
  assert.equal(putt.kind, 'Putt');

  await RoundRecorder.holeOut(1, pt(0, 0, 1_800));

  await RoundRecorder.nextHole();
  const resumed = await RoundRecorder.resumeRound();
  assert.equal(resumed.currentHole, 2);

  await RoundRecorder.prevHole();
  const afterPrev = await RoundRecorder.resumeRound();
  assert.equal(afterPrev.currentHole, 1);

  await RoundRecorder.undoLast();
  const afterUndo = await RoundRecorder.resumeRound();
  assert.equal(afterUndo.holes[1].shots.length, 1);
});
