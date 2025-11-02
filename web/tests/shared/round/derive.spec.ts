import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveHoleState,
  distanceMeters,
  inferCarryFromNext,
  updateHoleDerivations,
} from '../../../../shared/round/derive';
import type { HoleState, RoundState, ShotEvent } from '../../../../shared/round/types';
import { holeSG, type ShotEvent as SGShot } from '../../../../shared/sg/hole';

function createRound(hole: HoleState): RoundState {
  return {
    id: 'round',
    courseId: 'course',
    startedAt: 1,
    holes: { [hole.hole]: hole },
    currentHole: hole.hole,
    tournamentSafe: false,
  };
}

function offsetPoint(distMeters: number): { lat: number; lon: number; ts: number } {
  const latOffset = distMeters / 111_320;
  return { lat: latOffset, lon: 0, ts: Math.round(distMeters) };
}

const defaultOpts = { jitter_m: 1.5, shouldCoalesce: () => false } as const;

function p(lat: number, lon: number): { lat: number; lon: number } {
  return { lat, lon };
}

function shot(
  seq: number,
  kind: ShotEvent['kind'],
  startLie: ShotEvent['startLie'],
  start: { lat: number; lon: number },
): ShotEvent {
  return {
    id: `test-${seq}`,
    hole: 1,
    seq,
    kind,
    start: { ...start, ts: seq * 1_000 },
    startLie,
  };
}

function makeHole(par: number, shots: ShotEvent[]): HoleState {
  return { hole: 1, par, shots };
}

test('carry zeroed for jitter within window', () => {
  const pin = { lat: 0, lon: 0 };
  const shot1: ShotEvent = {
    id: 's1',
    hole: 1,
    seq: 1,
    start: { lat: 0.001, lon: 0, ts: 1_000 },
    startLie: 'Tee',
    kind: 'Full',
  };
  const shot2: ShotEvent = {
    id: 's2',
    hole: 1,
    seq: 2,
    start: { lat: 0.001001, lon: 0.000001, ts: 5_000 },
    startLie: 'Fairway',
    kind: 'Full',
  };
  const hole: HoleState = { hole: 1, par: 4, pin, shots: [shot1, shot2] };
  const round = createRound(hole);
  const derived = deriveHoleState({ hole, round });
  assert.equal(derived.shots[0].carry_m, 0);
});

test('sg sum matches holeSG baseline with approach + putts', () => {
  const pin = { lat: 0, lon: 0 };
  const shots: ShotEvent[] = [
    {
      id: 's1',
      hole: 1,
      seq: 1,
      start: offsetPoint(160),
      end: offsetPoint(25),
      startLie: 'Fairway',
      endLie: 'Rough',
      kind: 'Full',
    },
    {
      id: 's2',
      hole: 1,
      seq: 2,
      start: offsetPoint(25),
      end: offsetPoint(2),
      startLie: 'Rough',
      endLie: 'Green',
      kind: 'Full',
    },
    {
      id: 's3',
      hole: 1,
      seq: 3,
      start: offsetPoint(2),
      end: offsetPoint(0.4),
      startLie: 'Green',
      endLie: 'Green',
      kind: 'Putt',
    },
    {
      id: 's4',
      hole: 1,
      seq: 4,
      start: offsetPoint(0.4),
      end: offsetPoint(0),
      startLie: 'Green',
      endLie: 'Green',
      kind: 'Putt',
    },
  ];
  const hole: HoleState = { hole: 1, par: 4, pin, shots };
  const round = createRound(hole);
  const derived = deriveHoleState({ hole, round });
  const sgShots: SGShot[] = derived.shots.map((shot, idx) => ({
    start_m: shot.toPinStart_m ?? 0,
    end_m: idx === derived.shots.length - 1 ? 0 : shot.toPinEnd_m ?? 0,
    startLie: shot.startLie.toLowerCase() as SGShot['startLie'],
    endLie: (shot.endLie ?? shot.startLie).toLowerCase() as SGShot['endLie'],
    holed: idx === derived.shots.length - 1,
  }));
  const expected = holeSG(sgShots);
  assert(Math.abs((derived.sgTotal ?? 0) - expected.total) < 1e-6);
});

test('pin override updates toPin metrics', () => {
  const pinA = { lat: 0, lon: 0 };
  const pinB = { lat: 0, lon: 0.0001 };
  const shot: ShotEvent = {
    id: 'shot',
    hole: 1,
    seq: 1,
    start: { lat: 0.0005, lon: 0, ts: 1_000 },
    end: { lat: 0.0005, lon: 0.00005, ts: 1_200 },
    startLie: 'Fairway',
    endLie: 'Green',
    kind: 'Full',
  };
  const holeA: HoleState = { hole: 1, par: 4, pin: pinA, shots: [shot] };
  const roundA = createRound(holeA);
  const derivedA = deriveHoleState({ hole: holeA, round: roundA });
  const holeB: HoleState = { ...holeA, pin: pinB };
  const roundB = createRound(holeB);
  const derivedB = deriveHoleState({ hole: holeB, round: roundB });
  const distA = derivedA.shots[0].toPinStart_m ?? 0;
  const distB = derivedB.shots[0].toPinStart_m ?? 0;
  assert.notEqual(Math.round(distA), Math.round(distB));
  assert(Math.abs(distB - distanceMeters(shot.start, pinB)) < 0.5);
});

test('computes carry from previous start when prev.end missing', () => {
  const prev: ShotEvent = {
    id: 'prev',
    hole: 1,
    seq: 1,
    start: { lat: 0, lon: 0, ts: 1_000 },
    startLie: 'Fairway',
    kind: 'Full',
  };
  const nextStart = { lat: 0.0009, lon: 0.0009, ts: 2_000 };
  const update = inferCarryFromNext(prev, nextStart, 'Rough', 142, 0.1, () => false);
  assert.equal(update.setEnd, true);
  assert(update.carry_m > 0);
  assert.equal(update.endLie, 'Rough');
});

test('coalesced carry leaves previous end untouched', () => {
  const prev: ShotEvent = {
    id: 'prev',
    hole: 1,
    seq: 1,
    start: { lat: 0, lon: 0, ts: 1_000 },
    startLie: 'Fairway',
    kind: 'Full',
  };
  const nextStart = { lat: 0.000001, lon: 0.000001, ts: 1_200 };
  const update = inferCarryFromNext(prev, nextStart, 'Fairway', 150, 1.5, () => true);
  assert.equal(update.carry_m, 0);
  assert.equal(update.setEnd, false);
  assert.equal(update.end, undefined);
});

test('FIR is null after only tee shot if next shot not processed', () => {
  const hole = makeHole(4, [shot(1, 'Full', 'Tee', p(0, 0))]);
  const metrics = updateHoleDerivations(hole, hole.par, defaultOpts);
  assert.equal(metrics.fir, null);
});

test('FIR true when tee ends on fairway after second shot resolves endLie', () => {
  const hole = makeHole(4, [
    shot(1, 'Full', 'Tee', p(0, 0)),
    shot(2, 'Full', 'Fairway', p(0.001, 0)),
  ]);
  const metrics = updateHoleDerivations(hole, hole.par, defaultOpts);
  assert.equal(metrics.fir, true);
});

test('Par-3 tee to green: reachedGreenAt=1, GIR=true (no off-by-one)', () => {
  const hole = makeHole(3, [
    shot(1, 'Full', 'Tee', p(0, 0)),
    shot(2, 'Putt', 'Green', p(0.0005, 0.0005)),
  ]);
  const metrics = updateHoleDerivations(hole, hole.par, defaultOpts);
  assert.equal(metrics.reachedGreenAt, 1);
  assert.equal(metrics.gir, true);
});
