import { describe, expect, it } from 'vitest';

import { computeConfusion } from '../shotsenseMetrics';

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
