import { describe, expect, it } from 'vitest';

import {
  computeHomography,
  computeResiduals,
  estimateScale,
  qualityScore,
  toPixels,
  toWorld,
} from '@shared/tracer/calibrate';

const EPSILON = 1e-3;

describe('shared/tracer/calibrate', () => {
  it('computes homography that round-trips tee/flag points', () => {
    const tee = { x: 140, y: 1860 };
    const flag = { x: 900, y: 320 };
    const yardage = 180;
    const bearingDeg = 18;
    const H = computeHomography(tee, flag, bearingDeg, yardage);
    const teeWorld = toWorld(tee, H);
    const flagWorld = toWorld(flag, H);
    expect(Math.abs(teeWorld.x_m)).toBeLessThan(EPSILON);
    expect(Math.abs(teeWorld.y_m)).toBeLessThan(EPSILON);
    const distance = Math.hypot(flagWorld.x_m, flagWorld.y_m);
    expect(Math.abs(distance - yardage)).toBeLessThan(0.5);
    const flagRoundTrip = toPixels(flagWorld, H);
    expect(Math.abs(flagRoundTrip.x - flag.x)).toBeLessThan(1e-2);
    expect(Math.abs(flagRoundTrip.y - flag.y)).toBeLessThan(1e-2);
    const residuals = computeResiduals([tee, flag], H);
    expect(residuals.every((value: number) => value < 1e-2)).toBe(true);
  });

  it('estimates scale consistent with yardage', () => {
    const tee = { x: 40, y: 1840 };
    const flag = { x: 840, y: 400 };
    const yardage = 200;
    const scale = estimateScale(tee, flag, yardage);
    const pixelDistance = Math.hypot(flag.x - tee.x, flag.y - tee.y);
    expect(Math.abs(scale * pixelDistance - yardage)).toBeLessThan(1e-6);
  });

  it('scores quality using residual RMS', () => {
    const goodScore = qualityScore([0, 5, 10]);
    expect(goodScore).toBeGreaterThan(0.7);
    const poorScore = qualityScore([120]);
    expect(poorScore).toBe(0);
  });
});
