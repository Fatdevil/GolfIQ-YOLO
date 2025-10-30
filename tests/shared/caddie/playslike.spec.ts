import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PLAYS_LIKE_CLAMP,
  playsLikeDistance,
} from '../../../shared/caddie/playslike';

const closeTo = (value: number, expected: number, precision = 3): void => {
  expect(value).toBeCloseTo(expected, precision);
};

describe('playsLikeDistance', () => {
  it('computes uphill contribution without wind', () => {
    const result = playsLikeDistance({
      rawDist_m: 150,
      elevDiff_m: 10,
      temp_C: 15,
      heading_deg: 0,
    });
    closeTo(result.factor, 1.07);
    closeTo(result.breakdown.elev, 0.07);
    closeTo(result.breakdown.temp, 0);
    closeTo(result.breakdown.wind, 0);
    closeTo(result.distance_m, 160.5);
  });

  it('reduces distance for warmer temperatures', () => {
    const result = playsLikeDistance({
      rawDist_m: 150,
      elevDiff_m: 0,
      temp_C: 25,
      heading_deg: 0,
    });
    closeTo(result.factor, 0.98);
    closeTo(result.breakdown.temp, -0.02);
    closeTo(result.distance_m, 147);
  });

  it('handles headwind and tailwind coefficients', () => {
    const headwind = playsLikeDistance({
      rawDist_m: 150,
      elevDiff_m: 0,
      temp_C: 15,
      heading_deg: 0,
      wind_mps: { x: 0, y: -5 },
    });
    closeTo(headwind.factor, 1.1);
    closeTo(headwind.breakdown.wind, 0.1);
    closeTo(headwind.meta.headwind_mps, 5);

    const tailwind = playsLikeDistance({
      rawDist_m: 150,
      elevDiff_m: 0,
      temp_C: 15,
      heading_deg: 0,
      wind_mps: { x: 0, y: 5 },
    });
    closeTo(tailwind.factor, 0.925);
    closeTo(tailwind.breakdown.wind, -0.075);
    expect(tailwind.meta.headwind_mps).toBe(0);
  });

  it('clamps extreme factors to defaults', () => {
    const upper = playsLikeDistance({
      rawDist_m: 200,
      elevDiff_m: 30,
      temp_C: -10,
      heading_deg: 0,
      wind_mps: { x: 0, y: -20 },
    });
    expect(upper.factor).toBe(DEFAULT_PLAYS_LIKE_CLAMP.maxFactor);

    const lower = playsLikeDistance({
      rawDist_m: 200,
      elevDiff_m: -50,
      temp_C: 35,
      heading_deg: 0,
      wind_mps: { x: 0, y: 25 },
    });
    expect(lower.factor).toBe(DEFAULT_PLAYS_LIKE_CLAMP.minFactor);
  });

  it('projects wind along the shot heading', () => {
    const speed = 7;
    const component = speed / Math.sqrt(2);
    const result = playsLikeDistance({
      rawDist_m: 150,
      elevDiff_m: 0,
      temp_C: 15,
      heading_deg: 90,
      wind_mps: { x: component, y: component },
    });
    closeTo(result.meta.along_mps, -component, 5);
    expect(result.meta.headwind_mps).toBe(0);
    expect(result.breakdown.wind).toBeLessThan(0);
  });
});
