import { describe, expect, it } from "vitest";

import { computeTempAltDelta } from "../adjust_temp_alt";
import type { TempAltInput } from "../adjust_temp_alt";

const baseInput: Omit<TempAltInput, "temperature" | "altitudeASL"> = {
  baseDistance_m: 150,
  enable: true,
};

describe("computeTempAltDelta", () => {
  it("computes colder temperature boost", () => {
    const result = computeTempAltDelta({
      ...baseInput,
      temperature: { value: 10, unit: "C" },
      altitudeASL: null,
    });
    expect(result.deltaTemp_m).toBeGreaterThan(2.5);
    expect(result.deltaTemp_m).toBeLessThan(2.9);
    expect(result.deltaTotal_m).toBeCloseTo(result.deltaTemp_m, 5);
  });

  it("computes warmer temperature penalty", () => {
    const result = computeTempAltDelta({
      ...baseInput,
      temperature: { value: 30, unit: "C" },
      altitudeASL: null,
    });
    expect(result.deltaTemp_m).toBeLessThan(-2.5);
    expect(result.deltaTemp_m).toBeGreaterThan(-2.9);
    expect(result.deltaTotal_m).toBeCloseTo(result.deltaTemp_m, 5);
  });

  it("computes altitude bonus", () => {
    const result = computeTempAltDelta({
      ...baseInput,
      temperature: null,
      altitudeASL: { value: 1000, unit: "ft" },
    });
    expect(result.deltaAlt_m).toBeGreaterThan(2.7);
    expect(result.deltaAlt_m).toBeLessThan(3.3);
    expect(result.deltaTotal_m).toBeCloseTo(result.deltaAlt_m, 5);
  });

  it("returns zero for sea level", () => {
    const result = computeTempAltDelta({
      ...baseInput,
      temperature: null,
      altitudeASL: { value: 0, unit: "m" },
    });
    expect(result.deltaAlt_m).toBe(0);
    expect(result.deltaTotal_m).toBe(0);
  });

  it("treats Fahrenheit equivalent to Celsius", () => {
    const fahrenheit = computeTempAltDelta({
      ...baseInput,
      temperature: { value: 50, unit: "F" },
      altitudeASL: null,
    });
    const celsius = computeTempAltDelta({
      ...baseInput,
      temperature: { value: 10, unit: "C" },
      altitudeASL: null,
    });
    expect(fahrenheit.deltaTemp_m).toBeCloseTo(celsius.deltaTemp_m, 1e-6);
  });

  it("treats feet equivalent to metres", () => {
    const imperial = computeTempAltDelta({
      ...baseInput,
      temperature: null,
      altitudeASL: { value: 328, unit: "ft" },
    });
    const metric = computeTempAltDelta({
      ...baseInput,
      temperature: null,
      altitudeASL: { value: 100, unit: "m" },
    });
    expect(imperial.deltaAlt_m).toBeCloseTo(metric.deltaAlt_m, 1e-6);
  });

  it("applies per-component and total caps", () => {
    const result = computeTempAltDelta({
      ...baseInput,
      temperature: { value: -40, unit: "C" },
      altitudeASL: { value: 3000, unit: "m" },
      caps: { perComponent: 0.1, total: 0.15 },
    });
    expect(result.deltaTemp_m).toBeGreaterThan(11);
    expect(result.deltaTemp_m).toBeLessThan(11.3);
    expect(result.deltaAlt_m).toBeGreaterThan(11);
    expect(result.deltaAlt_m).toBeLessThan(11.3);
    expect(result.deltaTotal_m).toBeCloseTo(22.5, 1);
    expect(result.notes).toContain("temp_component_capped");
    expect(result.notes).toContain("alt_component_capped");
    expect(result.notes).toContain("total_capped");
  });

  it("respects master disable switch", () => {
    const result = computeTempAltDelta({
      baseDistance_m: 150,
      enable: false,
      temperature: { value: 10, unit: "C" },
      altitudeASL: { value: 1000, unit: "ft" },
    });
    expect(result.deltaTemp_m).toBe(0);
    expect(result.deltaAlt_m).toBe(0);
    expect(result.deltaTotal_m).toBe(0);
    expect(result.notes).toBeUndefined();
  });
});
