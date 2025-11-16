import { describe, expect, it } from "vitest";
import { convertMeters, formatDistance } from "@/utils/distance";

describe("distance utils", () => {
  it("converts meters to yards when needed", () => {
    expect(convertMeters(100, "metric")).toBe(100);
    expect(convertMeters(100, "imperial")).toBeCloseTo(109.36133);
  });

  it("formats distances with rounding and units", () => {
    expect(formatDistance(150, "metric")).toBe("150");
    expect(formatDistance(150, "imperial", { withUnit: true })).toBe("164 yd");
    expect(formatDistance(null, "metric", { withUnit: true })).toBe("–");
  });
});
