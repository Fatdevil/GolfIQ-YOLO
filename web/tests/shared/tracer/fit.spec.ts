import { afterEach, describe, expect, it } from 'vitest';

import { fitBallistic } from '@shared/tracer/fit';
import { __setTracerRcForTests } from '@shared/tracer/rc';

afterEach(() => {
  __setTracerRcForTests(null);
});

describe('shared/tracer/fit', () => {
  it('returns raw world points when provided', () => {
    const raw = [
      { x_m: 0, y_m: 0 },
      { x_m: 50, y_m: 20 },
      { x_m: 100, y_m: 0 },
    ];
    const fit = fitBallistic({ worldPoints: raw, carry_m: 100, apex_m: 25 });
    expect(fit).toBeTruthy();
    expect(fit!.source).toBe('raw');
    expect(fit!.points).toEqual(raw);
    expect(fit!.apexIndex).toBe(1);
  });

  it('computes ballistic path when raw data missing', () => {
    const fit = fitBallistic({ worldPoints: null, carry_m: 200, apex_m: 35 });
    expect(fit).toBeTruthy();
    expect(fit!.source).toBe('computed');
    const last = fit!.points[fit!.points.length - 1]!;
    expect(Math.abs(last.x_m - 200)).toBeLessThan(0.5);
    expect(last.y_m).toBe(0);
    expect(fit!.apexIndex).toBeGreaterThan(0);
  });

  it('falls back to synthetic path when carry missing', () => {
    const fit = fitBallistic({ worldPoints: null, carry_m: null, apex_m: 25 });
    expect(fit).toBeTruthy();
    expect(fit!.source).toBe('computed');
    expect(fit!.points.length).toBeGreaterThan(0);
  });
});
