import { beforeEach, describe, expect, it } from 'vitest';

import { __resetMemoryStoreForTests } from '../../../shared/core/pstore';
import { FollowStateMachine } from '../../../shared/follow/state';
import type { GeoPoint, HoleRef } from '../../../shared/follow/types';

const makeHole = (id: string, number: number, base: GeoPoint): HoleRef => ({
  id,
  number,
  front: base,
  middle: { lat: base.lat + 0.0002, lon: base.lon + 0.0002 },
  back: { lat: base.lat + 0.0004, lon: base.lon + 0.0004 },
});

describe('follow state machine', () => {
  beforeEach(() => {
    __resetMemoryStoreForTests();
  });

  const holes: HoleRef[] = [
    makeHole('h1', 1, { lat: 37.0, lon: -122.0 }),
    makeHole('h2', 2, { lat: 37.001, lon: -122.001 }),
    makeHole('h3', 3, { lat: 37.002, lon: -122.002 }),
  ];

  it('locates nearest hole within tolerance', async () => {
    const machine = await FollowStateMachine.create({ roundId: 'r1', holes });
    const result = await machine.tick({
      position: { lat: 37.00105, lon: -122.00105 },
      now: 10_000,
    });
    expect(result.state.hole?.id).toBe('h2');
    expect(result.state.phase).toBe('follow');
  });

  it('only advances after enter and leave thresholds', async () => {
    const machine = await FollowStateMachine.create({ roundId: 'r1', holes, autoAdvanceEnabled: false });
    const hole2Center = holes[1]!.middle;
    await machine.tick({ position: hole2Center, now: 1_000 });
    const followState = machine.snapshot;
    expect(followState.enterGreenAt).toBe(1_000);

    await machine.tick({
      position: { lat: hole2Center.lat + 0.0005, lon: hole2Center.lon + 0.0005 },
      speedMps: 1,
      now: 10_000,
    });
    expect(machine.snapshot.phase).toBe('follow');

    await machine.tick({
      position: { lat: hole2Center.lat + 0.0008, lon: hole2Center.lon + 0.0008 },
      speedMps: 1,
      now: 26_000,
    });
    expect(machine.snapshot.phase).toBe('advance');

    await machine.setAutoAdvance(true);
    const autoResult = await machine.tick({
      position: { lat: hole2Center.lat + 0.001, lon: hole2Center.lon + 0.001 },
      speedMps: 1,
      now: 27_000,
    });
    expect(autoResult.autoAdvanced).toBe(true);
    expect(autoResult.state.hole?.id).toBe('h3');
    expect(autoResult.state.phase).toBe('follow');
  });

  it('persists manual overrides across sessions', async () => {
    const machine = await FollowStateMachine.create({ roundId: 'persist', holes });
    await machine.manualNext(5_000);
    await machine.manualNext(6_000);
    expect(machine.snapshot.hole?.id).toBe('h2');
    const second = await FollowStateMachine.create({ roundId: 'persist', holes });
    expect(second.snapshot.hole?.id).toBe('h2');
    await second.manualPrev(8_000);
    expect(second.snapshot.hole?.id).toBe('h1');
  });
});
