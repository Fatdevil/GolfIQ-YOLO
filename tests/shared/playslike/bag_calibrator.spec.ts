import { describe, expect, it } from "vitest";

import { calibrate, type Shot } from "../../../shared/playslike/bag_calibrator";

describe("calibrate", () => {
  it("returns robust medians per club and filters outliers", () => {
    const shots: Shot[] = [
      { club: "7i", carry_m: 150 },
      { club: "7i", carry_m: 151 },
      { club: "7i", carry_m: 152 },
      { club: "7i", carry_m: 153 },
      { club: "7i", carry_m: 151 },
      { club: "7i", carry_m: 150 },
      { club: "7i", carry_m: 210, notes: "range ball" },
      { club: "PW", carry_m: 118 },
      { club: "PW", carry_m: 120 },
      { club: "PW", carry_m: 119 },
      { club: "PW", carry_m: 121 },
      { club: "PW", carry_m: 122 },
      { club: "PW", carry_m: 130 },
    ];

    const result = calibrate(shots);

    expect(result.usedShots).toBe(11);
    expect(result.suggested["7i"]).toBe(151);
    expect(result.perClub["7i"].n).toBe(6);
    expect(result.perClub["7i"].mad).toBeGreaterThan(0);
    expect(result.suggested.PW).toBe(120);
    expect(result.perClub.PW.n).toBe(5);
  });

  it("respects the minimum sample size", () => {
    const shots: Shot[] = [
      { club: "5i", carry_m: 180 },
      { club: "5i", carry_m: 179 },
      { club: "5i", carry_m: 178 },
      { club: "5i", carry_m: 181 },
    ];

    const result = calibrate(shots, 5);

    expect(Object.keys(result.suggested)).toHaveLength(0);
    expect(result.usedShots).toBe(0);
    expect(result.perClub).not.toHaveProperty("5i");
  });
});
