import { describe, expect, it } from "vitest";

import { computeWindSlopeDelta } from "../wind_slope";
import type { WindSlopeInput } from "../wind_slope";

const baseInput: Omit<WindSlopeInput, "baseDistance_m"> = {
  enable: true,
  wind: { speed_mps: 0, direction_deg_from: 0 },
  slope: { deltaHeight_m: 0 },
};

describe("computeWindSlopeDelta", () => {
  it("returns zero when disabled", () => {
    const result = computeWindSlopeDelta({
      baseDistance_m: 150,
      enable: false,
    });
    expect(result.deltaHead_m).toBe(0);
    expect(result.deltaSlope_m).toBe(0);
    expect(result.deltaTotal_m).toBe(0);
    expect(result.aimAdjust_deg).toBeUndefined();
  });

  it("ignores adjustments when base distance is non-positive", () => {
    const zeroDistance = computeWindSlopeDelta({
      baseDistance_m: 0,
      ...baseInput,
      wind: { speed_mps: 5, direction_deg_from: 0 },
    });
    expect(zeroDistance).toEqual({
      deltaHead_m: 0,
      deltaSlope_m: 0,
      deltaTotal_m: 0,
    });

    const negativeDistance = computeWindSlopeDelta({
      baseDistance_m: -40,
      ...baseInput,
      slope: { deltaHeight_m: 5 },
    });
    expect(negativeDistance).toEqual({
      deltaHead_m: 0,
      deltaSlope_m: 0,
      deltaTotal_m: 0,
    });
  });

  it("computes headwind and tailwind deltas", () => {
    const headwind = computeWindSlopeDelta({
      baseDistance_m: 150,
      ...baseInput,
      wind: { speed_mps: 5, direction_deg_from: 0 },
    });
    expect(headwind.deltaHead_m).toBeLessThan(-10.5);
    expect(headwind.deltaHead_m).toBeGreaterThan(-12.0);
    expect(headwind.deltaTotal_m).toBeCloseTo(headwind.deltaHead_m, 5);

    const tailwind = computeWindSlopeDelta({
      baseDistance_m: 150,
      ...baseInput,
      wind: { speed_mps: 5, direction_deg_from: 180 },
    });
    expect(tailwind.deltaHead_m).toBeGreaterThan(10.5);
    expect(tailwind.deltaHead_m).toBeLessThan(12.0);
    expect(tailwind.deltaTotal_m).toBeCloseTo(tailwind.deltaHead_m, 5);
  });

  it("computes slope adjustments", () => {
    const uphill = computeWindSlopeDelta({
      baseDistance_m: 150,
      ...baseInput,
      slope: { deltaHeight_m: 10 },
    });
    expect(uphill.deltaSlope_m).toBeLessThan(-8.0);
    expect(uphill.deltaSlope_m).toBeGreaterThan(-9.5);

    const downhill = computeWindSlopeDelta({
      baseDistance_m: 150,
      ...baseInput,
      slope: { deltaHeight_m: -10 },
    });
    expect(downhill.deltaSlope_m).toBeGreaterThan(8.0);
    expect(downhill.deltaSlope_m).toBeLessThan(9.5);
  });

  it("computes crosswind aim guidance without distance change", () => {
    const crosswind = computeWindSlopeDelta({
      baseDistance_m: 150,
      ...baseInput,
      wind: { speed_mps: 5, direction_deg_from: 90 },
    });
    expect(crosswind.deltaHead_m).toBeCloseTo(0, 6);
    expect(crosswind.deltaTotal_m).toBeCloseTo(0, 6);
    expect(crosswind.aimAdjust_deg).toBeGreaterThan(1.6);
    expect(crosswind.aimAdjust_deg).toBeLessThan(1.9);
  });

  it("caps per component contributions independently", () => {
    const result = computeWindSlopeDelta({
      baseDistance_m: 200,
      enable: true,
      wind: { speed_mps: 40, direction_deg_from: 0 },
      slope: { deltaHeight_m: -80 },
      coeff: {
        cap_per_component: 0.15,
        cap_total: 0.5,
      },
    });
    expect(result.deltaHead_m).toBeCloseTo(-30, 5);
    expect(result.deltaSlope_m).toBeCloseTo(30, 5);
    expect(result.deltaTotal_m).toBeCloseTo(0, 5);
    expect(result.notes).toContain("head_component_capped");
    expect(result.notes).toContain("slope_component_capped");
    expect(result.notes).not.toContain("total_capped");
  });

  it("caps total contribution when combined exceeds limit", () => {
    const result = computeWindSlopeDelta({
      baseDistance_m: 200,
      enable: true,
      wind: { speed_mps: 40, direction_deg_from: 0 },
      slope: { deltaHeight_m: -10 },
      coeff: {
        cap_per_component: 0.5,
        cap_total: 0.1,
      },
    });
    expect(result.notes).toContain("total_capped");
    expect(Math.abs(result.deltaTotal_m)).toBeLessThanOrEqual(20.01);
    expect(Math.abs(result.deltaHead_m)).toBeLessThanOrEqual(100);
  });
});
