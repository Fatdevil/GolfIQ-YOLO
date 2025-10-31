import { describe, expect, it } from 'vitest';

import {
  expStrokesFromDistance,
  expStrokes_Approach,
  expStrokes_Putt,
  expStrokes_Short,
  expStrokes_Tee,
  loadDefaultBaselines,
  type Lie,
} from '../../../shared/sg/baseline';

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

    const shortDistancesMeters = Array.from({ length: 36 }, (_, index) => index * 1);
    const shortFn = baselines.short;
    for (let i = 0; i < shortDistancesMeters.length - 1; i += 1) {
      const current = shortFn(shortDistancesMeters[i]);
      const next = shortFn(shortDistancesMeters[i + 1]);
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

  it('uses a dedicated short-game curve that differs from approach expectations', () => {
    const samples = [12, 20, 30];
    for (const distance of samples) {
      const approach = expStrokes_Approach(distance);
      const short = expStrokes_Short(distance);
      expect(Math.abs(short - approach)).toBeGreaterThan(1e-3);
      expect(short).toBeGreaterThanOrEqual(approach - 0.1);
    }
  });

  it('orders short-game difficulty between putting and approach for nearby distances', () => {
    const shortTwenty = expStrokes_Short(20);
    expect(shortTwenty).toBeGreaterThanOrEqual(expStrokes_Putt(20) - 1e-6);

    const shortThirty = expStrokes_Short(30);
    expect(shortThirty).toBeGreaterThanOrEqual(expStrokes_Approach(30) - 0.1);
  });

  it('routes expStrokesFromDistance to the correct baseline ranges', () => {
    expect(expStrokesFromDistance(10)).toBeCloseTo(expStrokes_Putt(10), 9);
    expect(expStrokesFromDistance(20.5)).toBeCloseTo(expStrokes_Short(20.5), 9);
    expect(expStrokesFromDistance(36)).toBeCloseTo(expStrokes_Approach(36), 9);
  });
});
