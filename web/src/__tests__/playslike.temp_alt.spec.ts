import { describe, expect, it } from "vitest";

import {
  computePlaysLike,
  computeAltitudeAdjust,
  computeTempAdjust,
} from "@shared/playslike/PlaysLikeService";

describe("temperature & altitude adjustments", () => {
  it("computes ~+2.7m at 10°C for 150m carry", () => {
    const adjust = computeTempAdjust(150, 10);
    expect(adjust).toBeGreaterThanOrEqual(2.2);
    expect(adjust).toBeLessThanOrEqual(3.2);

    const result = computePlaysLike(150, 0, 0, {
      cfg: { temperatureEnabled: true },
      temperatureC: 10,
    });
    expect(result.components.tempM).toBeGreaterThanOrEqual(2.2);
    expect(result.components.tempM).toBeLessThanOrEqual(3.2);
  });

  it("computes ~-2.7m at 30°C for 150m carry", () => {
    const adjust = computeTempAdjust(150, 30);
    expect(adjust).toBeLessThanOrEqual(-2.2);
    expect(adjust).toBeGreaterThanOrEqual(-3.2);

    const result = computePlaysLike(150, 0, 0, {
      cfg: { temperatureEnabled: true },
      temperatureC: 30,
    });
    expect(result.components.tempM).toBeLessThanOrEqual(-2.2);
    expect(result.components.tempM).toBeGreaterThanOrEqual(-3.2);
  });

  it("computes ~+14.6m at 1500m ASL for 150m carry", () => {
    const adjust = computeAltitudeAdjust(150, 1500);
    expect(adjust).toBeGreaterThanOrEqual(13.1);
    expect(adjust).toBeLessThanOrEqual(16.1);

    const result = computePlaysLike(150, 0, 0, {
      cfg: { altitudeEnabled: true },
      altitudeAsl_m: 1500,
    });
    expect(result.components.altM).toBeGreaterThanOrEqual(13.1);
    expect(result.components.altM).toBeLessThanOrEqual(16.1);
  });
});
