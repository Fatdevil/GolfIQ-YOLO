import { beforeEach, describe, expect, it } from 'vitest';

import { RoundRecorder, __resetRoundRecorderForTests } from '../../../shared/round/recorder';
import { setRoundStore, type RoundState, type RoundStore } from '../../../shared/round/storage';
import type { GeoPoint } from '../../../shared/round/types';

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
      const holeNumber = idx + 1;
      holes[holeNumber] = {
        hole: holeNumber,
        par: 4,
        shots: [],
        strokes: 0,
        putts: 0,
        penalties: 0,
        fir: null,
        gir: null,
      };
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

const gp = (lat: number, lon: number, ts: number): GeoPoint => ({ lat, lon, ts });

describe('RoundRecorder', () => {
  beforeEach(async () => {
    __resetRoundRecorderForTests();
    setRoundStore(new MemoryStore());
    await RoundRecorder.startRound('course', 1, false);
  });

  it('derives carry and strokes gained after sequential shots', async () => {
    await RoundRecorder.addShot(1, {
      kind: 'Full',
      start: gp(37.0, -122.0, 1_000),
      startLie: 'Tee',
      toPinStart_m: 180,
    });
    await RoundRecorder.addShot(1, {
      kind: 'Full',
      start: gp(37.0006, -122.0, 1_800),
      startLie: 'Fairway',
      toPinStart_m: 35,
    });

    const round = await RoundRecorder.resumeRound();
    const first = round.holes[1]?.shots[0];
    expect(first?.carry_m ?? 0).toBeGreaterThan(10);
    expect(Math.abs(first?.sg ?? 0)).toBeGreaterThan(0);
    expect(round.holes[1]?.strokes).toBeGreaterThanOrEqual(2);
  });

  it('adds penalty strokes and tracks putt overrides', async () => {
    await RoundRecorder.addShot(1, {
      kind: 'Full',
      start: gp(37.0, -122.0, 1_000),
      startLie: 'Tee',
      toPinStart_m: 180,
    });
    await RoundRecorder.addPenalty(1, 'OB');
    await RoundRecorder.setPuttCount(1, 2);

    const round = await RoundRecorder.resumeRound();
    const hole = round.holes[1]!;
    expect(hole.penalties).toBe(1);
    expect(hole.strokes).toBeGreaterThanOrEqual(2);
    expect(hole.putts).toBe(2);
  });

  it('supports undoing and re-adding shots without losing order', async () => {
    await RoundRecorder.addShot(1, {
      kind: 'Full',
      start: gp(37.0, -122.0, 1_000),
      startLie: 'Tee',
    });
    await RoundRecorder.addShot(1, {
      kind: 'Chip',
      start: gp(37.0003, -122.0, 1_400),
      startLie: 'Rough',
    });
    await RoundRecorder.addShot(1, {
      kind: 'Putt',
      start: gp(37.00031, -122.00002, 1_600),
      startLie: 'Green',
    });

    await RoundRecorder.undoLast();
    let round = await RoundRecorder.resumeRound();
    expect(round.holes[1]?.shots.length).toBe(2);

    await RoundRecorder.addShot(1, {
      kind: 'Putt',
      start: gp(37.00032, -122.00003, 1_900),
      startLie: 'Green',
    });
    round = await RoundRecorder.resumeRound();
    expect(round.holes[1]?.shots.length).toBe(3);
    expect(round.holes[1]?.shots.at(-1)?.seq).toBe(3);
  });
});
