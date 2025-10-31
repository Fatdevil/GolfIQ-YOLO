import { describe, expect, it } from 'vitest';

import { expStrokes_Tee, loadDefaultBaselines, type Lie } from '../../../shared/sg/baseline';

describe('multi-lie baselines', () => {
  const baselines = loadDefaultBaselines();

  it('are monotonic for every lie', () => {
    const longDistances = Array.from({ length: 121 }, (_, index) => index * 5);
    const shortDistances = Array.from({ length: 81 }, (_, index) => index * 0.25);
    const lies: readonly Lie[] = ['tee', 'fairway', 'rough', 'sand', 'recovery'];

    for (const lie of lies) {
      const fn = baselines[lie];
      for (let i = 0; i < longDistances.length - 1; i += 1) {
        const current = fn(longDistances[i]);
        const next = fn(longDistances[i + 1]);
        expect(next).toBeGreaterThanOrEqual(current - 1e-9);
      }
    }

    for (let i = 0; i < shortDistances.length - 1; i += 1) {
      const current = baselines.green(shortDistances[i]);
      const next = baselines.green(shortDistances[i + 1]);
      expect(next).toBeGreaterThanOrEqual(current - 1e-9);
    }
  });

  it('clamps inputs at both extremes', () => {
    const teeAtZero = baselines.tee(0);
    expect(baselines.tee(-50)).toBeCloseTo(teeAtZero, 9);

    const maxSample = baselines.fairway(600);
    expect(baselines.fairway(6000)).toBeCloseTo(maxSample, 9);
  });

  it('treats non-finite values as zero distance', () => {
    expect(baselines.rough(Number.NaN)).toBeCloseTo(baselines.rough(0), 9);
    expect(baselines.green(Number.POSITIVE_INFINITY)).toBeCloseTo(baselines.green(0), 9);
  });

  it('keeps expStrokes_Tee aligned with the tee baseline', () => {
    expect(expStrokes_Tee(200)).toBeCloseTo(baselines.tee(200), 9);
    expect(expStrokes_Tee(450)).toBeCloseTo(baselines.tee(450), 9);
  });
});
