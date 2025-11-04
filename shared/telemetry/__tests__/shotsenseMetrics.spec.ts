import { beforeEach, describe, expect, it } from 'vitest';

import type { ShotEvent } from '../../round/types';
import { __TESTING__, appendHoleAccuracy, computeConfusion } from '../shotsenseMetrics';

function shot(ts: number, source: string = 'manual'): ShotEvent {
  return {
    id: `shot-${ts}`,
    hole: 1,
    seq: 1,
    kind: 'Full',
    start: { lat: 0, lon: 0, ts },
    startLie: 'Fairway',
    source,
  };
}

describe('computeConfusion', () => {
  it('counts perfect matches as true positives', () => {
    const auto = [shot(1_000, 'auto'), shot(5_000, 'auto')];
    const recorded = [shot(1_050), shot(5_010)];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 2, fp: 0, fn: 0 });
  });

  it('counts unmatched auto shots as false positives', () => {
    const auto = [shot(2_000, 'auto')];
    const recorded: ShotEvent[] = [];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 0, fp: 1, fn: 0 });
  });

  it('counts unmatched manual shots as false negatives', () => {
    const auto: ShotEvent[] = [];
    const recorded = [shot(3_500)];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 0, fp: 0, fn: 1 });
  });

  it('ignores auto-sourced recordings when counting false negatives', () => {
    const auto: ShotEvent[] = [];
    const recorded = [shot(4_000, 'auto')];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 0, fp: 0, fn: 0 });
  });

  it('matches shots within ±2 seconds tolerance', () => {
    const auto = [shot(10_000, 'auto')];
    const recorded = [shot(11_800)];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 1, fp: 0, fn: 0 });
  });
});

describe('appendHoleAccuracy', () => {
  beforeEach(() => {
    __TESTING__.clear();
  });

  it('records perfect detections', () => {
    appendHoleAccuracy('round-1', 12, { tp: 2, fp: 0, fn: 0 });
    expect(__TESTING__._rows).toHaveLength(1);
    expect(__TESTING__._rows[0]).toMatchObject({ roundId: 'round-1', hole: 12, tp: 2, fp: 0, fn: 0 });
  });

  it('records false positives', () => {
    appendHoleAccuracy('round-1', 5, { tp: 0, fp: 1, fn: 0 });
    expect(__TESTING__._rows).toHaveLength(1);
    expect(__TESTING__._rows[0]).toMatchObject({ roundId: 'round-1', hole: 5, fp: 1, tp: 0, fn: 0 });
  });

  it('records missed shots as false negatives', () => {
    appendHoleAccuracy('round-2', 7, { tp: 0, fp: 0, fn: 2 });
    expect(__TESTING__._rows).toHaveLength(1);
    expect(__TESTING__._rows[0]).toMatchObject({ roundId: 'round-2', hole: 7, fn: 2 });
  });
});
