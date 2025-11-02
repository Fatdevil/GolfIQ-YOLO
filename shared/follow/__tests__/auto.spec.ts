import { describe, expect, it } from 'vitest';

import { bearing } from '../geo';
import { stepAutoV2, type AutoInput, type AutoState } from '../auto';

type HoleConfig = AutoInput['hole'];

type NextConfig = NonNullable<AutoInput['next']>;

type PrevConfig = NonNullable<AutoInput['prev']>;

const DEFAULT_OPTS = {
  greenEnter_r: 25,
  greenLeave_r: 40,
  tee_r: 20,
  minEnter_s: 3,
  minLeave_s: 10,
  headingAgreeDeg: 25,
} as const;

describe('stepAutoV2', () => {
  const hole1: HoleConfig = {
    id: 1,
    par: 3,
    green: { mid: { lat: 0, lon: 0 }, radius_m: 12 },
    tee: { lat: -0.0009, lon: 0 },
  };
  const hole2: NextConfig = {
    id: 2,
    tee: { lat: 0.0008, lon: 0 },
    green: { mid: { lat: 0.001, lon: 0 }, radius_m: 12 },
  };
  const hole0: PrevConfig = {
    id: 18,
    tee: { lat: -0.001, lon: 0.0004 },
    green: { mid: { lat: -0.0012, lon: 0.0006 }, radius_m: 12 },
  };

  it('advances after sustained green dwell and exit', () => {
    let state: AutoState = { stableHoleId: 1 };
    const insideGreen: AutoInput = {
      pos: { lat: 0.00001, lon: 0.00001, ts: 1_000, speed_mps: 0.2 },
      hole: hole1,
      next: hole2,
    };
    state = stepAutoV2(state, insideGreen, DEFAULT_OPTS);
    expect(state.reachedGreenAt).toBe(1_000);
    expect(state.stableHoleId).toBe(1);

    state = stepAutoV2(state, { ...insideGreen, pos: { ...insideGreen.pos, ts: 3_000 } }, DEFAULT_OPTS);
    expect(state.reachedGreenAt).toBe(1_000);

    state = stepAutoV2(state, { ...insideGreen, pos: { ...insideGreen.pos, ts: 4_500 } }, DEFAULT_OPTS);
    expect(state.reachedGreenAt).toBe(1_000);

    const exitGreen: AutoInput = {
      pos: { lat: 0.0006, lon: 0.0002, ts: 12_000, speed_mps: 1.3 },
      hole: hole1,
      next: hole2,
    };
    state = stepAutoV2(state, exitGreen, DEFAULT_OPTS);
    expect(state.leftGreenAt).toBe(12_000);
    expect(state.stableHoleId).toBe(1);

    state = stepAutoV2(state, { ...exitGreen, pos: { ...exitGreen.pos, ts: 23_000 } }, DEFAULT_OPTS);
    expect(state.stableHoleId).toBe(2);
    expect(state.reachedGreenAt).toBeUndefined();
    expect(state.leftGreenAt).toBeUndefined();
  });

  it('ignores brief green proximity walk-bys', () => {
    let state: AutoState = { stableHoleId: 1 };
    const briefPass: AutoInput = {
      pos: { lat: 0.00002, lon: 0.00002, ts: 1_000, speed_mps: 1.1 },
      hole: hole1,
      next: hole2,
    };
    state = stepAutoV2(state, briefPass, DEFAULT_OPTS);
    expect(state.reachedGreenAt).toBe(1_000);

    state = stepAutoV2(state, { ...briefPass, pos: { ...briefPass.pos, ts: 2_500 } }, DEFAULT_OPTS);
    // still within dwell window — detection pending
    expect(state.reachedGreenAt).toBe(1_000);

    const exitQuick: AutoInput = {
      pos: { lat: 0.0005, lon: -0.0002, ts: 2_800, speed_mps: 1.1 },
      hole: hole1,
      next: hole2,
    };
    state = stepAutoV2(state, exitQuick, DEFAULT_OPTS);
    expect(state.reachedGreenAt).toBeUndefined();

    const away: AutoInput = {
      pos: { lat: 0.0006, lon: -0.0003, ts: 12_000, speed_mps: 1.2 },
      hole: hole1,
      next: hole2,
    };
    state = stepAutoV2(state, away, DEFAULT_OPTS);
    state = stepAutoV2(state, { ...away, pos: { ...away.pos, ts: 22_000 } }, DEFAULT_OPTS);
    expect(state.stableHoleId).toBe(1);
  });

  it('locks to next tee box when aligned', () => {
    const heading = bearing(hole2.tee, hole2.green!.mid);
    let state: AutoState = { stableHoleId: 1 };
    const approach: AutoInput = {
      pos: { lat: hole2.tee.lat + 0.00005, lon: hole2.tee.lon, ts: 60_000, speed_mps: 0.4, headingDeg: heading },
      hole: hole1,
      next: hole2,
    };
    state = stepAutoV2(state, approach, DEFAULT_OPTS);
    expect(state.stableHoleId).toBe(2);
    expect(state.atTeeBox).toEqual({ holeId: 2, ts: 60_000 });
  });

  it('locks to previous tee when backtracking', () => {
    const heading = bearing(hole0.tee, hole0.green!.mid);
    const initial: AutoState = { stableHoleId: 2 };
    const backtrack: AutoInput = {
      pos: { lat: hole0.tee.lat + 0.00005, lon: hole0.tee.lon + 0.00002, ts: 90_000, speed_mps: 0.5, headingDeg: heading },
      hole: hole1,
      next: hole2,
      prev: hole0,
    };
    const state = stepAutoV2(initial, backtrack, DEFAULT_OPTS);
    expect(state.stableHoleId).toBe(18);
    expect(state.atTeeBox).toEqual({ holeId: 18, ts: 90_000 });
  });

  it('maintains tee lock until outside release radius', () => {
    const heading = bearing(hole2.tee, hole2.green!.mid);
    let state: AutoState = { stableHoleId: 1 };
    state = stepAutoV2(state, {
      pos: { lat: hole2.tee.lat + 0.00005, lon: hole2.tee.lon, ts: 100_000, speed_mps: 0.4, headingDeg: heading },
      hole: hole1,
      next: hole2,
    }, DEFAULT_OPTS);
    expect(state.stableHoleId).toBe(2);
    expect(state.atTeeBox?.holeId).toBe(2);

    const stillNear: AutoInput = {
      pos: { lat: hole2.tee.lat + 0.0001, lon: hole2.tee.lon + 0.00005, ts: 102_000, speed_mps: 0.3, headingDeg: heading },
      hole: hole1,
      next: hole2,
    };
    state = stepAutoV2(state, stillNear, DEFAULT_OPTS);
    expect(state.stableHoleId).toBe(2);
    expect(state.atTeeBox?.holeId).toBe(2);

    const farAway: AutoInput = {
      pos: { lat: hole2.tee.lat + 0.002, lon: hole2.tee.lon, ts: 120_000, speed_mps: 1.1, headingDeg: heading },
      hole: hole1,
      next: hole2,
    };
    state = stepAutoV2(state, farAway, DEFAULT_OPTS);
    expect(state.atTeeBox).toBeNull();
    expect(state.stableHoleId).toBe(2);
  });
});
