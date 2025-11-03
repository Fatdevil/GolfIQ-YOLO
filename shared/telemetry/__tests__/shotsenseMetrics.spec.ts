import { beforeEach, describe, expect, it } from 'vitest';

import { __TESTING__, appendHoleAccuracy, computeConfusion } from '../shotsenseMetrics';

describe('computeConfusion', () => {
  it('counts perfect matches as true positives', () => {
    const auto = [{ ts: 1_000 }, { ts: 5_000 }];
    const recorded = [
      { ts: 1_050, source: 'manual' },
      { ts: 5_010, source: 'manual' },
    ];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 2, fp: 0, fn: 0 });
  });

  it('counts unmatched auto shots as false positives', () => {
    const auto = [{ ts: 2_000 }];
    const recorded: Array<{ ts: number; source?: string }> = [];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 0, fp: 1, fn: 0 });
  });

  it('counts unmatched manual shots as false negatives', () => {
    const auto: Array<{ ts: number }> = [];
    const recorded = [{ ts: 3_500, source: 'manual' }];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 0, fp: 0, fn: 1 });
  });

  it('ignores auto-sourced recordings when counting false negatives', () => {
    const auto: Array<{ ts: number }> = [];
    const recorded = [{ ts: 4_000, source: 'auto' }];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 0, fp: 0, fn: 0 });
  });

  it('matches shots within ±2 seconds tolerance', () => {
    const auto = [{ ts: 10_000 }];
    const recorded = [{ ts: 11_800 }];
    expect(computeConfusion(auto, recorded)).toEqual({ tp: 1, fp: 0, fn: 0 });
  });
});

describe('appendHoleAccuracy', () => {
  beforeEach(() => {
    __TESTING__.clear();
  });

  it('records perfect detections', () => {
    appendHoleAccuracy(12, { holeIndex: 3, timestamp: 1_000, tp: 2, fp: 0, fn: 0 });
    expect(__TESTING__._rows).toHaveLength(1);
    expect(__TESTING__._rows[0]).toEqual({
      holeId: 12,
      holeIndex: 3,
      timestamp: 1_000,
      tp: 2,
      fp: 0,
      fn: 0,
    });
  });

  it('records false positives', () => {
    appendHoleAccuracy(5, { timestamp: 2_000, tp: 0, fp: 1, fn: 0 });
    expect(__TESTING__._rows).toHaveLength(1);
    expect(__TESTING__._rows[0]).toMatchObject({ holeId: 5, fp: 1, tp: 0, fn: 0 });
  });

  it('records missed shots as false negatives', () => {
    appendHoleAccuracy(7, { timestamp: 3_000, tp: 0, fp: 0, fn: 2 });
    expect(__TESTING__._rows).toHaveLength(1);
    expect(__TESTING__._rows[0]).toMatchObject({ holeId: 7, fn: 2 });
  });
});
