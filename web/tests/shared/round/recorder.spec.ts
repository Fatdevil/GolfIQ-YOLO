import assert from 'node:assert/strict';
import test from 'node:test';

import { RoundRecorder, __resetRoundRecorderForTests } from '../../../../shared/round/recorder';
import type { GeoPoint, Lie, RoundState, ShotEvent } from '../../../../shared/round/types';
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

const lies: Lie[] = ['Tee', 'Fairway', 'Rough', 'Sand', 'Recovery', 'Green', 'Penalty'];

function pt(lat: number, lon: number, ts: number): GeoPoint {
  return { lat, lon, ts };
}

test('recorder maintains homogeneous ShotEvent arrays', async () => {
  __resetRoundRecorderForTests();
  setRoundStore(new MemoryStore());

  await RoundRecorder.startRound('course', 1, false);
  await RoundRecorder.markHit({ club: '7i', lie: 'Fairway', loc: pt(0, 0, 1_000) });
  await RoundRecorder.markHit({ club: 'PW', lie: 'Rough', loc: pt(0.001, 0.001, 1_500) });
  await RoundRecorder.holeOut(1, pt(0, 0, 1_900));

  const round = await RoundRecorder.resumeRound();
  const shots = round.holes[1]?.shots ?? [];
  assert(Array.isArray(shots));
  assert(shots.every((shot) => lies.includes(shot.startLie)));
  assert(shots.every((shot) => !shot.endLie || lies.includes(shot.endLie)));
  assert(shots.every((shot): shot is ShotEvent => typeof shot.id === 'string' && shot.kind !== undefined));
  assert.equal(shots.at(-1)?.endLie, 'Green');
});
