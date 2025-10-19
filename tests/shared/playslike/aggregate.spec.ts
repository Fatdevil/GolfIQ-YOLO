import { describe, expect, it } from "vitest";

import { computePlaysLike } from "../../../shared/playslike/aggregate";
import { defaultBag, suggestClub } from "../../../shared/playslike/bag";

describe("computePlaysLike", () => {
  it("combines modules and surfaces club suggestion", () => {
    const result = computePlaysLike({
      baseDistance_m: 150,
      temperatureC: 10,
      altitude_m: 0,
      wind_mps: 5,
      wind_from_deg: 0,
      target_azimuth_deg: 0,
      slope_dh_m: 10,
    });

    expect(result.breakdown.temp_m).toBeGreaterThan(2.5);
    expect(result.breakdown.temp_m).toBeLessThan(2.8);
    expect(result.breakdown.head_m).toBeLessThan(-10.5);
    expect(result.breakdown.head_m).toBeGreaterThan(-12.0);
    expect(result.breakdown.slope_m).toBeLessThan(-8.5);
    expect(result.breakdown.slope_m).toBeGreaterThan(-9.5);

    expect(result.playsLike_m).toBeGreaterThan(131);
    expect(result.playsLike_m).toBeLessThan(134);

    const bag = defaultBag();
    const expectedClub = suggestClub(bag, result.playsLike_m);
    expect(result.clubSuggested).toBe(expectedClub);
  });
});
