import { describe, expect, it } from 'vitest';

import { TAU, wrapRad, diffRad, deg, rad, slerpYaw } from '../../../shared/arhud/angles';

describe('angles utilities', () => {
  it('wrapRad normalises values into (-π, π]', () => {
    expect(wrapRad(0)).toBe(0);
    expect(wrapRad(Math.PI)).toBe(Math.PI);
    expect(wrapRad(-Math.PI)).toBe(Math.PI);
    expect(wrapRad(3 * Math.PI)).toBe(Math.PI);
    expect(wrapRad(-3 * Math.PI)).toBe(Math.PI);
    expect(wrapRad(TAU + rad(45))).toBeCloseTo(rad(45));
    expect(wrapRad(-TAU - rad(30))).toBeCloseTo(-rad(30));
  });

  it('diffRad returns the minimal signed difference', () => {
    expect(deg(diffRad(rad(170), rad(-170)))).toBeCloseTo(-20, 5e-7);
    expect(deg(diffRad(rad(-170), rad(170)))).toBeCloseTo(20, 5e-7);
    expect(deg(diffRad(rad(181), rad(-179)))).toBeCloseTo(2, 5e-7);
    expect(deg(diffRad(rad(-179), rad(181)))).toBeCloseTo(-2, 5e-7);
  });

  it('deg and rad are inverses for finite inputs', () => {
    expect(deg(rad(90))).toBeCloseTo(90);
    expect(rad(deg(Math.PI / 4))).toBeCloseTo(Math.PI / 4);
  });

  it('slerpYaw interpolates along the shortest arc', () => {
    const start = rad(170);
    const end = rad(-170);
    const mid = slerpYaw(start, end, 0.5);
    expect(deg(mid)).toBeCloseTo(180);
    expect(slerpYaw(start, end, 0)).toBeCloseTo(wrapRad(start));
    expect(slerpYaw(start, end, 1)).toBeCloseTo(wrapRad(end));
  });
});
